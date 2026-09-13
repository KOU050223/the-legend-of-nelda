/**
 * 戦闘の状態。docs/technical-design.md §7 の State Machine に対応する。
 */
export const COMBAT_STATES = [
  'INTRO',
  'IDLE',
  'TELEGRAPH',
  'ATTACK',
  'JUDGE',
  'HIT',
  'COUNTER_WINDOW',
  'DAMAGE',
  'BOSS_DEFEATED',
  'PLAYER_LOSE',
] as const;

export type CombatState = (typeof COMBAT_STATES)[number];

/**
 * 入力判定の結果。
 *
 * `TOO_EARLY` と `MISS` はどちらも「成功しない」が、仕様上の帰結が違うので
 * 分けている。受付開始より前の入力は無効化して硬直させるだけ (被弾しない)
 * のに対し、受付終了より後は被弾する
 * (docs/single-player-poc-spec.md §13 / INPUT-005 対 INPUT-008)。
 */
export type JudgeResult = 'PERFECT_DODGE' | 'JUST_GUARD' | 'HIT' | 'MISS' | 'TOO_EARLY';
