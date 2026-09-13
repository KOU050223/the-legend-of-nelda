/**
 * 戦闘バランスの数値。docs/single-player-poc-spec.md §4 / §5。
 *
 * プレイテストで一番よく触る値なのでここへ集約する。
 * ダメージ量は #4 のボス攻撃定義がここを参照する
 * (Issue #5「技ごとのダメージ量を設定から変更できる」)。
 */

/** ボスHPの初期値。docs/single-player-poc-spec.md §5。 */
export const INITIAL_BOSS_HP = 100;

/** この値へ到達すると敗北。docs/single-player-poc-spec.md §4。 */
export const MAX_SLEEPINESS = 100;

/** SLEEPINESS の初期値。 */
export const INITIAL_SLEEPINESS = 0;

/** PoC で実装するボス技。docs/single-player-poc-spec.md §6。 */
export const ATTACK_IDS = ['PILLOW_SWEEP', 'YAWN_WAVE', 'FLUFFY_FUTON'] as const;

export type AttackId = (typeof ATTACK_IDS)[number];

/** 1つの技に紐づくダメージ量。 */
export interface AttackDamage {
  /** 反撃を当てたときにボスHPから引く量。 */
  bossDamage: number;
  /** 被弾したときに SLEEPINESS へ足す量。 */
  sleepinessDamage: number;
}

/**
 * 技ごとのダメージ既定値。
 *
 * bossDamage は docs/single-player-poc-spec.md §5 の確定値
 * (枕10 / あくび15 / 布団30)。目安として5〜7回の成功で撃破できる。
 *
 * sleepinessDamage は仕様が幅を持つため (枕 +10〜15 / あくび +15〜20 /
 * 布団 +25〜30、同 §4) 中央付近を既定とし、プレイテストで調整する。
 */
export const DEFAULT_ATTACK_DAMAGE: Readonly<Record<AttackId, AttackDamage>> = {
  PILLOW_SWEEP: { bossDamage: 10, sleepinessDamage: 12 },
  YAWN_WAVE: { bossDamage: 15, sleepinessDamage: 18 },
  FLUFFY_FUTON: { bossDamage: 30, sleepinessDamage: 28 },
};
