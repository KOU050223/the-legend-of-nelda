/**
 * 最終決戦の進行状態。
 *
 * BossPhase は戦闘上の強さ・無敵などを表す。一方こちらは、堀大輔が眠るまでの
 * 演出と勝利条件を表す。二つを混ぜると既存のボス攻撃や結界の責務まで
 * cutscene 都合で膨らむため、最終局面専用に分けて持つ。
 */
export const FINALE_STATES = [
  'NONE',
  'FINAL_STANDOFF',
  'OCARINA_APPEARING',
  'WAITING_FOR_MELODY',
  'MELODY_ACCEPTED',
  'MEMORY',
  'HORI_FALLING_ASLEEP',
  'ENDING',
  'COMPLETE',
] as const;

export type FinaleState = (typeof FINALE_STATES)[number];

/** Finale State を演出順に1つだけ進める。終端では進まない。 */
export function nextFinaleState(state: FinaleState): FinaleState {
  const next = FINALE_STATES[FINALE_STATES.indexOf(state) + 1];
  return next ?? state;
}

/**
 * Final Standoff 以降は、通常の GameAction をゲーム進行へ渡さない。
 *
 * WAITING_FOR_MELODY 中に受けるのは GameAction ではなく #43 の NoteEvent。
 * そのためこの関数は WAITING_FOR_MELODY でも true になる。
 */
export function isFinaleInputLocked(state: FinaleState): boolean {
  return state !== 'NONE';
}

/** FINAL_STANDOFF 以降、ボスの通常AIを停止する。 */
export function isBossAiLockedByFinale(state: FinaleState): boolean {
  return state !== 'NONE';
}
