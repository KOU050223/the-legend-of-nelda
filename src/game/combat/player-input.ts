import type { GameClock } from '../clock';
import { DEFAULT_INPUT_LOCKS, type InputLockDurations } from '../config/combat-balance';
import type { PlayerAction } from '../types/player-action';

/**
 * 入力を受理したか、しなかったならなぜか。
 * docs/single-player-poc-spec.md §13 / docs/tests/phase1-single-player-test-spec.md §5。
 */
export type InputAcceptance =
  /** 受理した。呼び出し側が判定 (回避・ガード) か反撃 (攻撃) へ進める。 */
  | 'ACCEPTED'
  /** 受付開始より前の入力。無効化して硬直させる (INPUT-005 / INPUT-009)。 */
  | 'TOO_EARLY'
  /** 硬直中・再入力ロック中の入力。捨てる (INPUT-013)。 */
  | 'LOCKED'
  /** 反撃可能時間外の攻撃。空振りさせて硬直させる (INPUT-014)。 */
  | 'WHIFF';

/** 防御の択。攻撃と違い、着弾タイミングに対して判定される。 */
export type DefensiveAction = Exclude<PlayerAction, 'ATTACK'>;

export function isDefensiveAction(action: PlayerAction): action is DefensiveAction {
  return action !== 'ATTACK';
}

export interface PlayerInputGateOptions {
  clock: GameClock;
  /** 硬直・再入力ロックの長さ。省略時は仕様の既定値。 */
  locks?: Partial<InputLockDurations> | undefined;
}

/**
 * 入力の受付可否だけを決めるゲート。
 *
 * 「いま押せるか」(硬直・再入力ロック・連打) をここが持ち、
 * 「押したものが当たったか」(受付ウィンドウ) は judgePlayerAction が持つ。
 * 判定に必要な着弾時刻を知らずに済むので、State Machine やボス技の実装と
 * 独立してテストできる (docs/technical-design.md §5.1)。
 *
 * 防御 (回避・ガード) と攻撃でロックを分けて持つ。まとめると、回避成功後の
 * 0.7秒再入力ロックが布団カウンター (回避成功後0.8秒以内の攻撃) を
 * 塞いでしまうため (docs/single-player-poc-spec.md §12 の布団カウンター)。
 */
export interface PlayerInputGate {
  /**
   * 防御入力を受け付けるか決める。
   *
   * @param inWindow 受付ウィンドウへ入っているか。false なら早押しとして弾く。
   *   ウィンドウの内外は攻撃ごとの着弾時刻を持つ側が判断する。
   * @returns ACCEPTED / TOO_EARLY / LOCKED
   */
  submitDefensive(action: DefensiveAction, inWindow: boolean): InputAcceptance;

  /**
   * 攻撃入力を受け付けるか決める。
   *
   * @param inCounterWindow COUNTER_WINDOW 中か。false なら空振り (INPUT-014)。
   * @returns ACCEPTED / WHIFF / LOCKED
   */
  submitAttack(inCounterWindow: boolean): InputAcceptance;

  /** 防御入力がロック中か。 */
  isDefenseLocked(): boolean;
  /** 攻撃入力がロック中か。 */
  isAttackLocked(): boolean;

  /**
   * 硬直と再入力ロックを解く。
   *
   * 攻撃サイクルの切れ目では呼ばない。WHIFF / 早押しの硬直はサイクルを
   * 跨いで効くのが仕様の意図で、境界で解くと硬直時間が観測できなくなる。
   * 呼び出し元は戦闘のリスタート (RESULT-008 / #12)。
   */
  reset(): void;
}

export function createPlayerInputGate({ clock, locks }: PlayerInputGateOptions): PlayerInputGate {
  const durations: InputLockDurations = { ...DEFAULT_INPUT_LOCKS, ...locks };

  /** ロックが解ける時刻 (ms)。過ぎていれば入力できる。 */
  let defenseLockedUntil = Number.NEGATIVE_INFINITY;
  let attackLockedUntil = Number.NEGATIVE_INFINITY;

  /** ロックは「解ける時刻に達したら明ける」。境界ちょうどは入力できる。 */
  function locked(until: number): boolean {
    return clock.now() < until;
  }

  return {
    submitDefensive(_action, inWindow) {
      const now = clock.now();

      if (locked(defenseLockedUntil)) {
        return 'LOCKED';
      }

      if (!inWindow) {
        // 早押しは「採用される入力」にならず硬直だけを残す。ここで
        // 攻撃終了までロックしてしまうと、仕様が硬直時間を持つ意味がなくなる。
        defenseLockedUntil = now + durations.tooEarlyMs;
        return 'TOO_EARLY';
      }

      // 「最初の入力のみ採用」は、受理のたびに再入力ロックを置くことで満たす
      // (docs/single-player-poc-spec.md §13 連打対策)。
      defenseLockedUntil = now + durations.defenseMs;
      return 'ACCEPTED';
    },

    submitAttack(inCounterWindow) {
      const now = clock.now();

      if (locked(attackLockedUntil)) {
        return 'LOCKED';
      }

      if (!inCounterWindow) {
        attackLockedUntil = now + durations.whiffMs;
        return 'WHIFF';
      }

      // 成立した反撃も再入力を締める。反撃後の連打で Damage / Counter Event が
      // 複数回発生しないようにするため (COUNTER-006)。
      attackLockedUntil = now + durations.counterMs;
      return 'ACCEPTED';
    },

    isDefenseLocked() {
      return locked(defenseLockedUntil);
    },

    isAttackLocked() {
      return locked(attackLockedUntil);
    },

    reset() {
      defenseLockedUntil = Number.NEGATIVE_INFINITY;
      attackLockedUntil = Number.NEGATIVE_INFINITY;
    },
  };
}
