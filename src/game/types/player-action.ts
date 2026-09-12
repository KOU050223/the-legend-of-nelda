/**
 * プレイヤーがゲームへ入力できる行動。
 * DOM の KeyboardEvent はここへ変換してから Game Logic へ渡す。
 * (docs/development-workflow.md §2 / docs/technical-design.md §5.2)
 */
export const PLAYER_ACTIONS = ['DODGE_LEFT', 'DODGE_RIGHT', 'GUARD', 'ATTACK'] as const;

export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

export function isPlayerAction(value: string): value is PlayerAction {
  return (PLAYER_ACTIONS as readonly string[]).includes(value);
}
