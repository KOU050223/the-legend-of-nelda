import type { PlayerAction } from '../types/player-action';
import type { JudgeResult } from '../types/combat-state';

/** 判定に必要な攻撃側の情報。 */
export interface AttackTiming {
  /** この攻撃に対する正解入力。 */
  correctAction: PlayerAction;
  /** 着弾時刻 (ms)。 */
  hitAt: number;
  /** 完全回避 / ジャストガードとみなす許容幅 (ms)。 */
  perfectWindowMs: number;
  /** 入力自体を受け付ける幅 (ms)。これを外れると MISS。 */
  acceptWindowMs: number;
}

export interface JudgeInput {
  attack: AttackTiming;
  action: PlayerAction;
  /** 入力が発生した時刻 (ms)。 */
  inputAt: number;
}

/**
 * プレイヤー入力を判定する。Pure function。
 * docs/technical-design.md §4 の resolvePlayerAction に相当する。
 */
export function judgePlayerAction({ attack, action, inputAt }: JudgeInput): JudgeResult {
  const diff = Math.abs(inputAt - attack.hitAt);

  if (diff > attack.acceptWindowMs) {
    return 'MISS';
  }

  if (action !== attack.correctAction) {
    return 'HIT';
  }

  if (diff > attack.perfectWindowMs) {
    return 'HIT';
  }

  return action === 'GUARD' ? 'JUST_GUARD' : 'PERFECT_DODGE';
}
