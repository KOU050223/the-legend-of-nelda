import {
  createHoriBoss,
  type BossSnapshot,
  type HoriBoss,
  type HoriBossOptions,
} from '../boss/hori-boss';
import type { BossTarget } from '../boss/boss-target';
import { isBarrierPhase } from '../boss/boss-phase';
import {
  createBarrierChallenge,
  type BarrierChallenge,
  type BarrierChallengeSnapshot,
  type BarrierParticipant,
  type BarrierPayView,
  isBarrierAction,
} from '../barrier/barrier-challenge';
import { DEFAULT_REVIVAL, type CharacterId } from '../config/phase2-player-balance';
import type { PlanarPosition } from '../movement/types';
import type { GameEventBus } from '../events/game-event';
import {
  createPlayer,
  isWithinAttackReach,
  type Player,
  type PlayerSnapshot,
} from '../player/player-state';
import type { GameAction } from '../types/game-action';
import {
  isBossAiLockedByFinale,
  isFinaleInputLocked,
  nextFinaleState,
  type FinaleState,
} from '../finale/finale-state';

/** 最終形態で一度は攻撃不能を体験できるようにする猶予。 */
export const FINALE_STANDOFF_FALLBACK_MS = 4_000;

/**
 * 堀大輔と3人のプレイヤーを繋ぐ1戦ぶんのセッション。
 * docs/phase2-gameplay-spec.md §3 のコアループ。
 *
 * ボスとプレイヤーはお互いを知らない。ボスは `BossTarget` / `DamageSink`
 * という port 越しにプレイヤーを見て、プレイヤーは `onAttackHit` で
 * 「誰かへ当たった」ことだけを外へ出す。両者を結び付ける唯一の場所がここ。
 *
 * 相手が要る行動 (INTERACT / REVIVE / CHARACTER_ACTION) も、相手を知っている
 * この層が解決する。`player-state.ts` はそれらを意図的に持たない。
 */

export interface BossBattleOptions {
  readonly clock: { now(): number };
  readonly events: GameEventBus;
  /**
   * 参加するプレイヤーの構成。Player の生成はこの層が行う。
   *
   * プレイヤーの攻撃はボスへ当てる必要があり、その配線 (`onAttackHit`) は
   * ボスが出来てからでないと作れない。呼び出し側に生成させると、
   * 「後から onAttackHit を差し込む」口を Player 側へ開けることになる。
   */
  readonly roster: readonly PlayerSeed[];
  /** ボスの生成を差し替える。テストで技を固定するために使う。 */
  readonly createBoss?: (options: HoriBossOptions) => HoriBoss;
  /** 開発用。結界に入った瞬間に解除して、後半フェーズの確認を可能にする。 */
  readonly debugSkipBarriers?: boolean;
  /** ソロ進行では3人協力を前提にした結界を使わず、そのまま戦闘を続ける。 */
  readonly solo?: boolean;
}

export interface PlayerSeed {
  readonly id: string;
  readonly characterId: CharacterId;
  readonly position?: PlanarPosition;
}

export interface BattleSnapshot {
  readonly boss: BossSnapshot;
  readonly players: readonly PlayerSnapshot[];
  readonly barrier: BarrierChallengeSnapshot | null;
  /** Authority が持つ最終決戦の進行。全クライアントで同じ演出を始めるために送る。 */
  readonly finale: FinaleState;
}

export type BattleOutcome = 'ONGOING' | 'VICTORY' | 'DEFEAT';

/**
 * スナップショットだけから判定できる戦闘の勝敗。
 *
 * 勝利は HP ではなく finale が COMPLETE まで進んだことで決まる。HP が 0 に
 * なった時点で勝ちにすると、NO_SLEEP_MODE から始まる最終局面の演出が
 * 一切流れずに決着してしまう (§5.5)。
 *
 * リモートのクライアントは Authority の snapshot しか持たないので、勝敗も
 * snapshot だけから出せる必要がある。そのため finale もここで見る。
 */
export function outcomeOfSnapshot(snapshot: {
  readonly boss: { readonly hp: number };
  readonly players: readonly { readonly status: PlayerSnapshot['status'] }[];
  readonly finale?: FinaleState;
}): BattleOutcome {
  if (snapshot.finale === 'COMPLETE') return 'VICTORY';
  if (
    snapshot.players.length > 0 &&
    snapshot.players.every((player) => player.status === 'ASLEEP')
  ) {
    return 'DEFEAT';
  }
  return 'ONGOING';
}

export interface BossBattle {
  /** 1人のプレイヤーの入力を処理する。 */
  submit(playerId: string, action: GameAction): void;
  /** 時間を進める。 */
  update(deltaSeconds: number): void;
  /** 勝敗。§14。 */
  outcome(): BattleOutcome;
  /** 最終演出を次の状態へ進める。状態変更は Authority のみが行う。 */
  advanceFinale(): FinaleState;
  /** 開発用。結界を経ずにHP10%の最終形態直後へ移す。 */
  debugEnterNoSleepMode(): void;
  readonly boss: HoriBoss;
  readonly players: readonly Player[];
  snapshot(): BattleSnapshot;
  /** ACTIVE な PAY だけが結界の正解情報を取得する。 */
  barrierViewFor(playerId: string): BarrierPayView | null;
}

function toBarrierParticipant(player: Player): BarrierParticipant {
  const snapshot = player.snapshot();
  return {
    id: snapshot.id,
    characterId: snapshot.characterId,
    status: snapshot.status,
    position: snapshot.position,
  };
}

/**
 * ボスが狙ってよいプレイヤー。
 *
 * **倒れている仲間は配列から外す。** `invulnerable` を立てるだけでは足りない。
 * あれは当たり判定 (`resolveHits`) でしか見ておらず、狙いを決める
 * `aimAttack` は見ないので、ブルーライト照射が動けない相手を追い続ける。
 * 技が1サイクル丸ごと無駄になり、外から見ると壊れているように見える。
 */
function activeTargets(players: readonly Player[], now: number): BossTarget[] {
  const targets: BossTarget[] = [];
  for (const player of players) {
    const snapshot = player.snapshot();
    if (snapshot.status !== 'ACTIVE') continue;
    targets.push({
      id: snapshot.id,
      position: snapshot.position,
      // 回避の無敵中は判定を素通りする (§4.2)。
      //
      // `invulnerableUntil` は「無敵が明ける時刻」で、明けても null へは
      // 戻らない。null かどうかだけで見ると、一度回避したプレイヤーが
      // 以降ずっと無敵になる。
      invulnerable: snapshot.invulnerableUntil !== null && now < snapshot.invulnerableUntil,
    });
  }
  return targets;
}

export function createBossBattle(options: BossBattleOptions): BossBattle {
  const {
    clock,
    events,
    roster,
    createBoss = createHoriBoss,
    debugSkipBarriers = false,
    solo = false,
  } = options;

  let boss: HoriBoss;

  const players: Player[] = roster.map((seed) =>
    createPlayer({
      id: seed.id,
      characterId: seed.characterId,
      clock,
      ...(seed.position === undefined ? {} : { position: seed.position }),
      // プレイヤーの攻撃がボスへ届く経路。届いているかの判定はここが持つ。
      onAttackHit: (hit) => {
        const bossPosition = boss.snapshot().position;
        if (!isWithinAttackReach(hit, bossPosition)) return;
        const wasNoSleepMode = boss.snapshot().phase === 'NO_SLEEP_MODE';
        boss.damage(hit.damage);
        if (wasNoSleepMode) startFinaleFromNullifiedAttack();
      },
    }),
  );

  const byId = new Map(players.map((player) => [player.snapshot().id, player]));

  boss = createBoss({
    clock,
    events,
    // ボスの攻撃が実際にプレイヤーHPを削る経路。
    damageSink: {
      applyDamage(hit) {
        byId.get(hit.targetId)?.takeDamage(hit.amount);
      },
    },
  });

  let barrierChallenge: BarrierChallenge | null = null;
  let finale: FinaleState = 'NONE';
  let noSleepModeStartedAt: number | null = null;

  function syncFinale(): void {
    if (boss.snapshot().phase !== 'NO_SLEEP_MODE') return;

    const now = clock.now();
    if (noSleepModeStartedAt === null) noSleepModeStartedAt = now;
    if (finale === 'NONE' && now - noSleepModeStartedAt >= FINALE_STANDOFF_FALLBACK_MS) {
      finale = 'FINAL_STANDOFF';
    }
  }

  /** 通常攻撃が無効化された瞬間は、時間待ちせず最終演出へ入る。 */
  function startFinaleFromNullifiedAttack(): void {
    syncFinale();
    if (boss.snapshot().phase === 'NO_SLEEP_MODE' && finale === 'NONE') {
      finale = 'FINAL_STANDOFF';
    }
  }

  function syncBarrierChallenge(): void {
    const phase = boss.snapshot().phase;
    if (!isBarrierPhase(phase)) {
      barrierChallenge = null;
      return;
    }

    // 表示・入力が未統合の単独プレイ画面でも、終盤の調整を止めないための開発口。
    // 呼び出し側は production でこの値を渡さない。通常の結界ルールは変えない。
    if (solo || debugSkipBarriers) {
      boss.breakBarrier();
      barrierChallenge = null;
      return;
    }

    if (barrierChallenge === null || barrierChallenge.snapshot().phase !== phase) {
      barrierChallenge = createBarrierChallenge(phase);
    }
  }

  function findReviveTarget(rescuer: Player): Player | null {
    const from = rescuer.snapshot().position;
    let nearest: Player | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of players) {
      const snapshot = candidate.snapshot();
      if (snapshot.status !== 'FALLING_ASLEEP') continue;
      const distance = Math.hypot(snapshot.position.x - from.x, snapshot.position.z - from.z);
      if (distance > DEFAULT_REVIVAL.reviveRange) continue;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = candidate;
      }
    }
    return nearest;
  }

  return {
    submit(playerId, action) {
      const player = byId.get(playerId);
      if (player === undefined) return;

      // WAITING_FOR_MELODY も含め、最終演出中に受ける通常入力は進行へ渡さない。
      // オカリナは後続Phaseで NoteEvent の専用経路から受ける。
      if (isFinaleInputLocked(finale)) return;

      if (action.type === 'REVIVE') {
        // 相手を知っているこの層が、範囲内の倒れた仲間を探して繋ぐ。
        const target = findReviveTarget(player);
        if (target !== null) player.reviveNeighbor(target);
        return;
      }

      if (isBarrierAction(action)) {
        syncBarrierChallenge();
        if (barrierChallenge !== null) {
          const result = barrierChallenge.submit(toBarrierParticipant(player), action);
          if (result.completed) {
            boss.breakBarrier();
            syncBarrierChallenge();
          }
          return;
        }
      }

      player.submit(action);
    },

    update(deltaSeconds) {
      syncFinale();
      if (isBossAiLockedByFinale(finale)) return;

      for (const player of players) player.update(deltaSeconds);
      syncBarrierChallenge();
      boss.update(activeTargets(players, clock.now()));
      syncBarrierChallenge();
      syncFinale();
    },

    outcome() {
      // 3人全員が完全に寝たら敗北 (§5.5)。判定そのものは
      // outcomeOfSnapshot に一本化し、ローカルとリモートで同じ規則を通す。
      return outcomeOfSnapshot({
        boss: boss.snapshot(),
        players: players.map((player) => player.snapshot()),
        finale,
      });
    },

    advanceFinale() {
      syncFinale();
      if (finale === 'NONE') return finale;
      finale = nextFinaleState(finale);
      return finale;
    },

    debugEnterNoSleepMode() {
      const snapshot = boss.snapshot();
      boss.restore({
        ...snapshot,
        hp: snapshot.hpMax * 0.1,
        phase: 'NO_SLEEP_MODE',
        activeAttack: null,
        bossDownUntil: null,
        nextAttackAt: clock.now(),
        takenAt: clock.now(),
      });
      barrierChallenge = null;
      finale = 'NONE';
      noSleepModeStartedAt = clock.now();
    },

    boss,
    players,

    snapshot() {
      syncBarrierChallenge();
      return {
        boss: boss.snapshot(),
        players: players.map((player) => player.snapshot()),
        barrier: barrierChallenge?.snapshot() ?? null,
        finale,
      };
    },

    barrierViewFor(playerId) {
      syncBarrierChallenge();
      const player = byId.get(playerId);
      if (player === undefined || barrierChallenge === null) return null;
      return barrierChallenge.viewFor(toBarrierParticipant(player));
    },
  };
}

/** プレイヤーの攻撃がボスへ届いているか。`isWithinAttackReach` の再公開。 */
export { isWithinAttackReach };
