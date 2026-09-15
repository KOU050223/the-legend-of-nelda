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
}

export type BattleOutcome = 'ONGOING' | 'VICTORY' | 'DEFEAT';

/** スナップショットだけから判定できる戦闘の勝敗。 */
export function outcomeOfSnapshot(snapshot: {
  readonly boss: { readonly hp: number };
  readonly players: readonly { readonly status: PlayerSnapshot['status'] }[];
}): BattleOutcome {
  if (snapshot.boss.hp <= 0) return 'VICTORY';
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
  const { clock, events, roster, createBoss = createHoriBoss } = options;

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
        boss.damage(hit.damage);
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

  function syncBarrierChallenge(): void {
    const phase = boss.snapshot().phase;
    if (!isBarrierPhase(phase)) {
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
      for (const player of players) player.update(deltaSeconds);
      syncBarrierChallenge();
      boss.update(activeTargets(players, clock.now()));
      syncBarrierChallenge();
    },

    outcome() {
      return outcomeOfSnapshot({
        boss: boss.snapshot(),
        players: players.map((player) => player.snapshot()),
      });
    },

    boss,
    players,

    snapshot() {
      syncBarrierChallenge();
      return {
        boss: boss.snapshot(),
        players: players.map((player) => player.snapshot()),
        barrier: barrierChallenge?.snapshot() ?? null,
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
