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

/**
 * 入力ミス・入力受理にともなう硬直時間 (ms)。
 * docs/single-player-poc-spec.md §13。
 *
 * 仕様が幅を持つ値 (早押し 0.3〜0.5秒) は中央付近を既定とし、
 * プレイテストで調整する。Issue #3「入力受付時間を設定から調整できる」。
 */
export interface InputLockDurations {
  /** 早押し (TOO EARLY) で入力を弾いたあとの硬直。仕様は約0.3〜0.5秒。 */
  tooEarlyMs: number;
  /**
   * 回避・ガードを受理したあとの再入力ロック。
   * 仕様が長さを定めているのは回避 (約0.7秒) だが、1サイクルに受理される
   * 防御入力は1つなので、ガードにも同じ値を掛けて「最初の入力のみ採用」を満たす。
   */
  defenseMs: number;
  /** 反撃可能時間外の攻撃 (WHIFF) のあとの硬直。仕様は約0.4秒。 */
  whiffMs: number;
  /**
   * 反撃が成立したあとの再入力ロック。
   *
   * 空振りの硬直とは別の値。成功後に連打しても Damage / Counter Event が
   * 複数回発生しないようにするためのもので (COUNTER-006)、
   * 反撃1回で COUNTER_WINDOW が閉じるため長さ自体は表に出にくい。
   */
  counterMs: number;
}

export const DEFAULT_INPUT_LOCKS: InputLockDurations = {
  tooEarlyMs: 400,
  defenseMs: 700,
  whiffMs: 400,
  counterMs: 400,
};
