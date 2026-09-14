import {
  BOSS_DOWN_DURATION_MS,
  HORI_ATTACK_IDS,
  HORI_INITIAL_HP,
  HORI_MOVE_SPEED,
  NEUTRAL_MODIFIERS,
  OVERDRIVE_MODIFIERS,
  type HoriAttackId,
  type OverdriveModifiers,
} from '../config/phase2-boss-balance';
import type { GameEventBus } from '../events/game-event';
import type { PlanarPosition } from '../movement/types';
import {
  attackIntervalMs,
  phaseAt,
  scaleTiming,
  type AttackPhase,
  type ScaledTiming,
} from './attack-scheduler';
import { aimAttack, dangerZonesOf, type AttackAim } from './attacks/hori-attacks';
import { isInsideDangerZone, type DangerZone } from './attacks/danger-zone';
import { advancePhase, isInvulnerablePhase, isOverdrivePhase, type BossPhase } from './boss-phase';
import type { BossTarget, DamageSink } from './boss-target';

/**
 * 堀大輔。Phase 2 のボス本体。docs/phase2-gameplay-spec.md §8〜§12。
 *
 * Phase 1 の `src/game/combat/state-machine.ts` は「1対1・1度に1攻撃サイクル・
 * IDLE で次の技を待つ」前提で、3人が同時に自由移動する戦闘には載らないため、
 * ボス本体は新規に書く (Issue #58)。一方 `clock.ts` / `game-event.ts` は
 * そのまま使う。
 *
 * React / Three.js へは依存しない (docs/technical-design.md §5.1)。表示側は
 * `snapshot()` を読むか GameEventBus を購読する。
 */

/** 技を出していない、または出している最中の状態。 */
export interface ActiveAttackSnapshot {
  readonly attackId: HoriAttackId;
  /** 予兆の開始時刻 (GameClock の now)。 */
  readonly startedAt: number;
  /** 予兆の開始時に固定された狙い。 */
  readonly aim: AttackAim;
  /** すでにダメージを与えた相手。判定中に何度も当たらないようにする。 */
  readonly hitTargetIds: readonly string[];
  /** この技に適用済みの尺。オーバードライブ中に境界を跨いでも尺が変わらない。 */
  readonly timing: ScaledTiming;
}

/**
 * 外へ出せるボスの状態。**すべて JSON でシリアライズできる値だけを持つ**
 * (Issue #58「ボス状態がシリアライズ可能なスナップショットとして外へ出せる」)。
 *
 * 関数・クラスインスタンス・Map / Set は入れない。マルチプレイ同期を
 * 後から載せる際 (#52 P6) に、この型をそのまま送れることが前提になっている。
 *
 * 進行中の技は `startedAt` を絶対時刻で持つ。経過時間ではなく開始時刻に
 * したのは、復元した側が自分の時計と突き合わせて「予兆の残り」を正しく
 * 再現できるようにするため。経過時間だと送受信の間に進んだ分がずれる。
 */
export interface BossSnapshot {
  readonly hp: number;
  readonly hpMax: number;
  readonly phase: BossPhase;
  readonly position: PlanarPosition;
  readonly rotationY: number;
  /** 発動した技の通し番号。狙いの擬似乱数 seed でもある。 */
  readonly attackCount: number;
  readonly activeAttack: ActiveAttackSnapshot | null;
  /** BOSS DOWN が明ける時刻。ダウン中でなければ null。 */
  readonly bossDownUntil: number | null;
  /** 次の技を始められる時刻。 */
  readonly nextAttackAt: number;
}

export interface HoriBossOptions {
  readonly clock: { now(): number };
  readonly events: GameEventBus;
  readonly damageSink: DamageSink;
  readonly initialHp?: number;
  readonly initialPosition?: PlanarPosition;
  /**
   * 出す技を選ぶ関数。省略すると通し番号から決定論的に回す。
   * フェーズごとの技構成 (§12: 導入は3種、70%以降に圧縮フィールド追加) は
   * ここで表現する。
   */
  readonly pickAttack?: (phase: BossPhase, attackCount: number) => HoriAttackId;
}

export interface HoriBoss {
  /** 時間を進める。判定・フェーズ進行・技の発動はすべてここから起きる。 */
  update(targets: readonly BossTarget[]): void;
  /** ボスへダメージを与える。無敵フェーズでは 0 になる。 */
  damage(amount: number): number;
  /** 結界を解除して BOSS DOWN (総攻撃を受けられる状態) へ移す。§11.2。 */
  breakBarrier(): void;
  /** 現在展開している危険範囲。描画と判定が同じ値を読む。 */
  dangerZones(targets: readonly BossTarget[]): DangerZone[];
  /** 今この瞬間の状態。シリアライズして送れる。 */
  snapshot(): BossSnapshot;
  /** スナップショットから状態を戻す。進行中の技も途中から続く。 */
  restore(snapshot: BossSnapshot): void;
}

/**
 * 導入フェーズでは圧縮フィールドを出さない (§12 Phase 1 の使用攻撃候補は
 * 突進・アラーム・ブルーライトの3種)。70% を割ってから4種目が入る。
 */
function defaultPickAttack(phase: BossPhase, attackCount: number): HoriAttackId {
  const pool: readonly HoriAttackId[] =
    phase === 'INTRO' || phase === 'BARRIER_1'
      ? (['MORNING_DASH', 'WAKE_UP_ALARM', 'BLUE_LIGHT'] as const)
      : HORI_ATTACK_IDS;

  // 通し番号で回す。ランダムにしないのは、同じ入力から同じ戦闘が
  // 再現できる方がテストもリプレイも書けるため。
  return pool[attackCount % pool.length] ?? 'MORNING_DASH';
}

export function createHoriBoss(options: HoriBossOptions): HoriBoss {
  const {
    clock,
    events,
    damageSink,
    initialHp = HORI_INITIAL_HP,
    initialPosition = { x: 0, z: 0 },
    pickAttack = defaultPickAttack,
  } = options;

  let hp = initialHp;
  let hpMax = initialHp;
  let phase: BossPhase = 'INTRO';
  let position: PlanarPosition = initialPosition;
  let rotationY = 0;
  let attackCount = 0;
  let activeAttack: ActiveAttackSnapshot | null = null;
  let bossDownUntil: number | null = null;
  let nextAttackAt = clock.now();

  function modifiers(): OverdriveModifiers {
    return isOverdrivePhase(phase) ? OVERDRIVE_MODIFIERS : NEUTRAL_MODIFIERS;
  }

  function setPhase(next: BossPhase): void {
    if (next === phase) return;
    const from = phase;
    phase = next;
    events.emit({ type: 'BOSS_PHASE_CHANGED', from, to: next });
  }

  /**
   * HPの変化を1段ずつフェーズへ反映する。1回のダメージで複数の境界を
   * 跨いでも `advancePhase` が1段しか進めないため、結界を飛ばせない。
   */
  function syncPhase(): void {
    const next = advancePhase(phase, hp / hpMax);
    if (next !== phase) setPhase(next);
  }

  function currentZones(targets: readonly BossTarget[]): DangerZone[] {
    if (activeAttack === null) return [];
    return dangerZonesOf(activeAttack.attackId, {
      aim: activeAttack.aim,
      elapsedMs: clock.now() - activeAttack.startedAt,
      targets,
    });
  }

  function startAttack(targets: readonly BossTarget[]): void {
    const attackId = pickAttack(phase, attackCount);
    const aim = aimAttack(attackId, {
      bossPosition: position,
      targets,
      seed: attackCount + 1,
    });
    activeAttack = {
      attackId,
      startedAt: clock.now(),
      aim,
      hitTargetIds: [],
      timing: scaleTiming(attackId, modifiers()),
    };
    attackCount += 1;
    if (attackId === 'MORNING_DASH') rotationY = aim.rotationY;

    events.emit({
      type: 'BOSS_ATTACK_STARTED',
      attackId,
      telegraphMs: activeAttack.timing.telegraphMs,
    });
  }

  /** 判定中の当たり判定。同じ技で同じ相手に2回は入らない。 */
  function resolveHits(targets: readonly BossTarget[]): void {
    if (activeAttack === null) return;
    const zones = currentZones(targets);
    const hitIds = [...activeAttack.hitTargetIds];

    for (const target of targets) {
      if (target.invulnerable === true) continue;
      if (hitIds.includes(target.id)) continue;
      if (!zones.some((zone) => isInsideDangerZone(zone, target.position))) continue;

      hitIds.push(target.id);
      damageSink.applyDamage({ targetId: target.id, amount: activeAttack.timing.damage });
      events.emit({
        type: 'BOSS_ATTACK_HIT',
        attackId: activeAttack.attackId,
        targetId: target.id,
        damage: activeAttack.timing.damage,
      });
    }

    activeAttack = { ...activeAttack, hitTargetIds: hitIds };
  }

  function attackPhase(): AttackPhase {
    if (activeAttack === null) return 'DONE';
    return phaseAt(clock.now() - activeAttack.startedAt, activeAttack.timing);
  }

  return {
    update(targets) {
      const now = clock.now();

      // BOSS DOWN 中は技を出さない。総攻撃を受ける時間 (§11.2)。
      if (bossDownUntil !== null) {
        if (now < bossDownUntil) return;
        bossDownUntil = null;
        events.emit({ type: 'BOSS_DOWN_ENDED' });
        nextAttackAt = now + attackIntervalMs(modifiers());
        return;
      }

      // 結界フェーズ中はボスが動かない。解除は breakBarrier() から。
      if (isInvulnerablePhase(phase) && activeAttack === null) return;

      if (activeAttack !== null) {
        const current = attackPhase();
        if (current === 'ACTIVE') resolveHits(targets);
        if (current === 'DONE') {
          events.emit({ type: 'BOSS_ATTACK_ENDED', attackId: activeAttack.attackId });
          activeAttack = null;
          nextAttackAt = now + attackIntervalMs(modifiers());
        }
        return;
      }

      if (now >= nextAttackAt) startAttack(targets);
    },

    damage(amount) {
      if (isInvulnerablePhase(phase)) {
        // 結界中 / NO SLEEP MODE は 0 DAMAGE (§11 / §12)。
        events.emit({ type: 'BOSS_DAMAGE_NULLIFIED', phase });
        return hp;
      }
      hp = Math.min(hpMax, Math.max(0, hp - amount));
      events.emit({ type: 'BOSS_HP_CHANGED', hp });
      syncPhase();
      return hp;
    },

    breakBarrier() {
      if (phase !== 'BARRIER_1' && phase !== 'BARRIER_2') return;
      // 結界を割った直後は BOSS DOWN。ここで次のフェーズへ1段進む。
      setPhase(advancePhase(phase, hp / hpMax));
      bossDownUntil = clock.now() + BOSS_DOWN_DURATION_MS;
      activeAttack = null;
      events.emit({ type: 'BOSS_DOWN_STARTED', durationMs: BOSS_DOWN_DURATION_MS });
    },

    dangerZones(targets) {
      return currentZones(targets);
    },

    snapshot() {
      return {
        hp,
        hpMax,
        phase,
        position,
        rotationY,
        attackCount,
        activeAttack,
        bossDownUntil,
        nextAttackAt,
      };
    },

    restore(next) {
      hp = next.hp;
      hpMax = next.hpMax;
      phase = next.phase;
      position = next.position;
      rotationY = next.rotationY;
      attackCount = next.attackCount;
      activeAttack = next.activeAttack;
      bossDownUntil = next.bossDownUntil;
      nextAttackAt = next.nextAttackAt;
    },
  };
}

/** ボスの移動速度。オーバードライブで上がる (§10)。 */
export function bossMoveSpeed(phase: BossPhase): number {
  const scale = isOverdrivePhase(phase)
    ? OVERDRIVE_MODIFIERS.moveSpeedScale
    : NEUTRAL_MODIFIERS.moveSpeedScale;
  return HORI_MOVE_SPEED * scale;
}
