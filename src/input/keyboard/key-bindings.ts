import type { PlayerAction } from '@/game/types';

/**
 * KeyboardEvent.code から PlayerAction へのマッピング。
 * キー割り当てを変えても Game Logic とテストへ影響しないよう、
 * 変換をこの層に閉じ込める。(docs/development-workflow.md §2)
 */
export const DEFAULT_KEY_BINDINGS: Readonly<Record<string, PlayerAction>> = {
  ArrowLeft: 'DODGE_LEFT',
  KeyA: 'DODGE_LEFT',
  ArrowRight: 'DODGE_RIGHT',
  KeyD: 'DODGE_RIGHT',
  ArrowDown: 'GUARD',
  KeyS: 'GUARD',
  Space: 'ATTACK',
  KeyJ: 'ATTACK',
};
