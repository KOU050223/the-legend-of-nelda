import type { PlayerAction } from '../types/player-action';
import type { JudgeResult } from '../types/combat-state';

/**
 * 判定に必要な攻撃側の情報。
 *
 * 受付ウィンドウは着弾時刻からの符号付きオフセット (ms) で表す。
 * 仕様上の受付幅は着弾前後で非対称なため (回避 -600ms〜+100ms /
 * ガード -700ms〜+100ms、docs/tests/phase1-single-player-test-spec.md §5)、
 * 単一の幅ではなく start / end を個別に持つ。
 */
export interface AttackTiming {
  /** この攻撃に対する正解入力。 */
  correctAction: PlayerAction;
  /** 着弾時刻 (ms)。 */
  hitAt: number;
  /** 入力受付の開始オフセット (ms)。着弾より前なので通常は負値。 */
  acceptFromMs: number;
  /** 入力受付の終了オフセット (ms)。着弾より後なので通常は正値。 */
  acceptToMs: number;
  /** 完全回避 / ジャストガードとみなす開始オフセット (ms)。通常は負値。 */
  perfectFromMs: number;
  /** 完全回避 / ジャストガードとみなす終了オフセット (ms)。通常は正値。 */
  perfectToMs: number;
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
  /** 着弾時刻からの符号付きオフセット。負なら着弾前、正なら着弾後。 */
  const offset = inputAt - attack.hitAt;

  // 受付前と受付後を分ける。早すぎる入力は無効化して硬直させるだけだが、
  // 遅すぎる入力は被弾する (docs/single-player-poc-spec.md §13 /
  // INPUT-005 は TOO EARLY、INPUT-008 は被弾)。
  if (offset < attack.acceptFromMs) {
    return 'TOO_EARLY';
  }

  if (offset > attack.acceptToMs) {
    return 'MISS';
  }

  if (action !== attack.correctAction) {
    return 'HIT';
  }

  if (offset < attack.perfectFromMs || offset > attack.perfectToMs) {
    return 'HIT';
  }

  return action === 'GUARD' ? 'JUST_GUARD' : 'PERFECT_DODGE';
}
