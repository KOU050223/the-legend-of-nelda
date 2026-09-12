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

/** 入力判定の結果。 */
export type JudgeResult = 'PERFECT_DODGE' | 'JUST_GUARD' | 'HIT' | 'MISS';
