import {
  BOSS_DOWN_DURATION_MS,
  DEFAULT_HORI_ATTACKS,
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
import {
  advanceBeam,
  aimAttack,
  dangerZonesOf,
  dashLengthOf,
  type AttackAim,
} from './attacks/hori-attacks';
import { isInsideDangerZone, type DangerZone } from './attacks/danger-zone';
import {
  advancePhase,
  isInvulnerablePhase,
  isOverdrivePhase,
  phaseOrderOf,
  NO_SLEEP_MODE_HP_RATIO,
  type BossPhase,
} from './boss-phase';
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
  /**
   * 追尾ビームの現在の着弾点。BLUE_LIGHT のときだけ入る。
   *
   * 経過時間から毎回引き直すと、相手が横へ走ったときに「開始点から
   * 相手へ向かって経過時間ぶん」を取り直すことになり、着弾点が
   * 追尾速度の上限を超えて横滑りする。前フレームの位置から積むために持つ。
   */
  readonly beamOrigin: PlanarPosition | null;

  /**
   * 判定が出ている間に一度でも更新が来たか。
   *
   * 来ていなければ処理落ちで丸ごと飛ばしたということなので、硬直側の
   * フレームで1回だけ判定して取りこぼしを防ぐ。来ていれば、その後に
   * 範囲へ入ってきた相手は当てない (表示が既に消えているため)。
   */
  readonly resolvedDuringActive: boolean;
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
  /**
   * このスナップショットを取った時刻。
   *
   * 上の各時刻 (`activeAttack.startedAt` / `bossDownUntil` / `nextAttackAt`)
   * は、取った側の時計での絶対値。`performance.now()` の原点はページごとに
   * 違うので、別のクライアントや再読み込み後へそのまま渡すと、予兆が何分も
   * 明けないといったズレになる。`restore()` がこの値を基準に差分を取り直す
   * ので、送る側は何もしなくてよい。
   */
  readonly takenAt: number;
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
  /** 前回 update() を呼んだ時刻。追尾ビームの1フレームぶんを測るのに使う。 */
  let lastUpdateAt = clock.now();

  function modifiers(): OverdriveModifiers {
    return isOverdrivePhase(phase) ? OVERDRIVE_MODIFIERS : NEUTRAL_MODIFIERS;
  }

  function setPhase(next: BossPhase): void {
    if (next === phase) return;
    const from = phase;
    phase = next;

    // 結界 / NO SLEEP MODE へ入ったら、進行中の技を打ち切る。
    //
    // BOSS INVINCIBLE を宣言した後も判定が残っていると、協力ギミックの
    // 最中にプレイヤーが殴られる (§11 の結界の説明と食い違う)。予兆を
    // 出していた技は無かったことにする。
    if (isInvulnerablePhase(next) && activeAttack !== null) {
      events.emit({ type: 'BOSS_ATTACK_ENDED', attackId: activeAttack.attackId });
      activeAttack = null;
    }

    events.emit({ type: 'BOSS_PHASE_CHANGED', from, to: next });
  }

  /**
   * HPの変化を1段ずつフェーズへ反映する。1回のダメージで複数の境界を
   * 跨いでも `advancePhase` が1段しか進めないため、結界を飛ばせない。
   *
   * **結界フェーズからは呼ばないこと。** `advancePhase('BARRIER_1', 0.7)` は
   * 無条件に FIELD_ADDED を返すので、ここから呼ぶと協力ギミックを
   * 解除せずに素通りできてしまう。結界を抜ける唯一の経路は breakBarrier()。
   * damage() が isInvulnerablePhase で早期 return しているのはそのため。
   */
  function syncPhase(): void {
    const next = advancePhase(phase, hp / hpMax);
    if (next !== phase) setPhase(next);
  }

  /**
   * 技の形そのもの。表示に出すかどうかとは別で、判定はこちらを使う。
   *
   * 表示 (`dangerZones`) は硬直に入った時点で消すが、判定は処理落ちで
   * 飛ばしたフレームの分を拾う必要があるため、形は残しておく必要がある。
   * 「見えている範囲＝当たる範囲」は、両方がこの同じ形を読むことで保つ。
   */
  function attackShape(targets: readonly BossTarget[]): DangerZone[] {
    if (activeAttack === null) return [];

    return dangerZonesOf(activeAttack.attackId, {
      aim: activeAttack.aim,
      elapsedMs: clock.now() - activeAttack.startedAt,
      targets,
      ...(activeAttack.beamOrigin === null ? {} : { beamOrigin: activeAttack.beamOrigin }),
    });
  }

  /**
   * 今このフレームで画面へ出す危険範囲。
   *
   * 硬直 (RECOVER) 以降は出さない。判定はもう終わっているのに赤い帯が
   * 残ると、安全な場所が危険に見えて「危険範囲が読める」が崩れる。
   */
  function visibleZones(targets: readonly BossTarget[]): DangerZone[] {
    if (isAttackOver()) return [];
    return attackShape(targets);
  }

  /**
   * 判定がもう終わっているか (硬直以降)。
   *
   * 危険範囲の表示と当たり判定の両方がこれを見る。片方だけ止めると、
   * 見えていない範囲で当たる / 見えている範囲で当たらない のどちらかが起きる。
   */
  function isAttackOver(): boolean {
    if (activeAttack === null) return true;
    const elapsed = clock.now() - activeAttack.startedAt;
    const current = phaseAt(elapsed, activeAttack.timing);
    return current === 'RECOVER' || current === 'DONE';
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
      beamOrigin: attackId === 'BLUE_LIGHT' ? position : null,
      resolvedDuringActive: false,
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
    const zones = attackShape(targets);
    // 判定中は毎フレーム全員ぶん引くので、配列の走査ではなく Set で見る。
    // スナップショットへは配列のまま出す (JSON で送れる形を保つため)。
    const alreadyHit = new Set(activeAttack.hitTargetIds);
    const hitIds = [...activeAttack.hitTargetIds];

    for (const target of targets) {
      if (target.invulnerable === true) continue;
      if (alreadyHit.has(target.id)) continue;
      if (!zones.some((zone) => isInsideDangerZone(zone, target.position))) continue;

      hitIds.push(target.id);
      alreadyHit.add(target.id);
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

  /**
   * 早朝ルーティン突進の判定中、ボス自身が軌道上を進む。
   *
   * 危険範囲 (`aim.origin` 起点の直線) は動かさない。予兆で見せた軌道と
   * 実際に当たる範囲が同じでなければ「横へ回避する」が成立しないため
   * (§9.4)。動くのはボスの見た目の位置だけで、判定は据え置く。
   */
  /**
   * 追尾ビームの着弾点を1フレームぶん進める。
   *
   * 速度に上限があるので、走って距離を稼げば振り切れる (§9.2)。
   * 経過時間から毎回引き直すと、相手が横へ走った分だけ上限を超えて
   * 近づいてしまう。
   */
  function advanceBeamOrigin(targets: readonly BossTarget[], deltaMs: number): void {
    if (activeAttack === null || activeAttack.beamOrigin === null) return;

    const target = targets.find((candidate) => candidate.id === activeAttack?.aim.targetId);
    if (target === undefined) return;

    activeAttack = {
      ...activeAttack,
      beamOrigin: advanceBeam(activeAttack.beamOrigin, target.position, deltaMs),
    };
  }

  function advanceDash(): void {
    if (activeAttack === null || activeAttack.attackId !== 'MORNING_DASH') return;

    const spec = DEFAULT_HORI_ATTACKS.MORNING_DASH;
    if (spec.shape.kind !== 'LINE') return;

    // 突進の速さは、軌道の長さと判定の尺から逆算する。通常の移動速度
    // (4/秒) で 500ms だと 2 ユニットしか進まず、30 ユニットの帯を
    // 「高速突進」として見せているのに、ボスはほぼ止まったままになる。
    //
    // 速さは軌道の長さ (30) から求めたままにして、進める距離だけを境界で
    // 切る。壁に届かない突進の見え方と回避のタイミングを変えないため。
    // 壁まで届く突進は、途中で止まって残りの判定時間をその場で過ごす。
    const dashSpeed = spec.shape.length / (activeAttack.timing.activeMs / 1000);
    const elapsedInActive = clock.now() - activeAttack.startedAt - activeAttack.timing.telegraphMs;
    // 上限は予兆で見せた帯と同じ長さ。dangerZonesOf も同じ関数を使う。
    const travelled = Math.min(
      dashLengthOf(activeAttack.aim, spec.shape.length),
      (dashSpeed * Math.max(0, elapsedInActive)) / 1000,
    );
    const { origin, rotationY: aimRotation } = activeAttack.aim;
    position = {
      x: origin.x + -Math.sin(aimRotation) * travelled,
      z: origin.z + -Math.cos(aimRotation) * travelled,
    };
  }

  function attackPhase(): AttackPhase {
    if (activeAttack === null) return 'DONE';
    return phaseAt(clock.now() - activeAttack.startedAt, activeAttack.timing);
  }

  return {
    update(targets) {
      const now = clock.now();
      // ビームの進みに使う経過時間。update のたびに必ず進める。
      //
      // 技を出している間だけ更新すると、技と技の待ち時間 (1.5秒以上) が
      // まるごと次の技の初回フレームへ渡り、着弾点が追尾速度を無視して
      // 一気に飛ぶ。予兆の開始位置がボスの足元から離れてしまい、
      // 「予兆を見て走って逃げる」(§9.2) が成立しない。
      const deltaMs = Math.max(0, now - lastUpdateAt);
      lastUpdateAt = now;

      // BOSS DOWN 中は技を出さない。総攻撃を受ける時間 (§11.2)。
      if (bossDownUntil !== null) {
        if (now < bossDownUntil) return;
        bossDownUntil = null;
        events.emit({ type: 'BOSS_DOWN_ENDED' });
        // ダウン中に持ち越したHP変化をここで反映する。
        syncPhase();
        nextAttackAt = now + attackIntervalMs(modifiers());
        return;
      }

      // 結界フェーズ中はボスが動かない。解除は breakBarrier() から。
      if (isInvulnerablePhase(phase) && activeAttack === null) return;

      if (activeAttack !== null) {
        const current = attackPhase();

        // 予兆中からビームは動く。予兆を見て走り出す時間が要るため。
        advanceBeamOrigin(targets, deltaMs);

        // 判定が出ている尺をフレームがまたいでも取りこぼさない。処理落ちや
        // バックグラウンドのタブでは TELEGRAPH から RECOVER へ一気に飛ぶ。
        // そこで捨てると、当たっていたはずの攻撃が黙って無かったことになる。
        // プレイヤー側 (player-state.ts) と同じ扱いにしてある。
        // 予兆を過ぎていれば判定する。処理落ちで判定の尺をまたいでも
        // 取りこぼさないため、ACTIVE 局面にフレームが入ったかでは見ない。
        //
        // ただし「判定が終わってから初めて更新が来た」場合に当ててはいけない。
        // 危険範囲の表示は既に消えており、見えない範囲で殴られることになる。
        // `hitTargetIds` があるので、判定中に一度でも更新が来ていれば
        // ここを飛ばしても取りこぼさない。
        const reachedActive = now - activeAttack.startedAt >= activeAttack.timing.telegraphMs;
        const over = isAttackOver();
        // 判定中に一度も更新が来ていなければ、処理落ちで丸ごと飛ばしている。
        // 当たった人数では判断できない (誰も範囲に居なければ0のまま)。
        const skippedWholeWindow = over && !activeAttack.resolvedDuringActive;

        if (reachedActive && (!over || skippedWholeWindow)) {
          advanceDash();
          resolveHits(targets);
          activeAttack = { ...activeAttack, resolvedDuringActive: true };
        }

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
      // NO SLEEP MODE の手前で必ず止める。
      //
      // 通常攻撃ではHPを削れなくなるフェーズ (§12) なので、そこを通り越して
      // 0 まで落ちると最終局面ごと飛ばして勝ててしまう。BOSS DOWN 中は
      // フェーズ遷移を持ち越すため (下記)、この下限が無いと総攻撃の一撃で
      // 40% から 0 まで抜けられる。
      const floor = hpMax * NO_SLEEP_MODE_HP_RATIO;
      const reachedFinalPhase = phaseOrderOf(phase) >= phaseOrderOf('NO_SLEEP_MODE');
      const lowest = reachedFinalPhase ? 0 : floor;

      hp = Math.min(hpMax, Math.max(lowest, hp - amount));
      events.emit({ type: 'HORI_HP_CHANGED', hp, hpMax });

      // BOSS DOWN 中はフェーズを進めない。
      //
      // 総攻撃 (§11.2) の最中に境界を割ると、その場で結界フェーズへ入って
      // 無敵になり、残りのダウン時間の追撃が丸ごと無効になる。ご褒美である
      // はずの総攻撃が途中から黙って無意味になるので、ダウンが明けてから
      // まとめて反映する。
      //
      // ただし NO SLEEP MODE への遷移だけは持ち越さない。上の下限で HP は
      // 10% で止まっており、ここを遅らせると「削れないはずのボスがダウン中
      // だけ削れる」状態が残る。
      if (bossDownUntil === null || hp <= floor) syncPhase();

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
      return visibleZones(targets);
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
        takenAt: clock.now(),
      };
    },

    restore(next) {
      hp = next.hp;
      hpMax = next.hpMax;
      phase = next.phase;
      position = next.position;
      rotationY = next.rotationY;
      attackCount = next.attackCount;

      // 送り主の時計と自分の時計の原点をそろえる。
      //
      // performance.now() の原点はページごとに違うので、絶対時刻をそのまま
      // 受け取ると、送り主が10分前に開いていた場合に予兆が9分明けない、
      // といったことが起きる。送られてきた時刻の「残り」だけを取り出して、
      // 自分の今へ積み直す。
      const shift = clock.now() - next.takenAt;
      const rebase = (at: number): number => at + shift;

      activeAttack =
        next.activeAttack === null
          ? null
          : { ...next.activeAttack, startedAt: rebase(next.activeAttack.startedAt) };
      bossDownUntil = next.bossDownUntil === null ? null : rebase(next.bossDownUntil);
      nextAttackAt = rebase(next.nextAttackAt);
      lastUpdateAt = clock.now();
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
