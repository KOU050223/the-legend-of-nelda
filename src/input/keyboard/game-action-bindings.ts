import type { DiscreteGameActionType } from '@/game/types/game-action';

/**
 * Phase 2 のキー割り当て。
 *
 * Phase 1 の `DEFAULT_KEY_BINDINGS` とは別表にする。あちらは KeyA/KeyD が
 * DODGE、KeyS が GUARD だが、Phase 2 は WASD を移動に使い、ガードを
 * 基本アクションから外した (docs/phase2-gameplay-spec.md §4.3)。同じ表へ
 * 混ぜるとどちらのシーンでもキーが噛み合わない。
 *
 * 回避は「移動方向 + 回避入力」(§4.2) なので、方向は WASD が持ち、
 * ここでは回避そのものの1キーだけを割り当てる。
 */
export const PHASE2_KEY_BINDINGS: Readonly<Record<string, DiscreteGameActionType>> = {
  Space: 'ATTACK',
  KeyJ: 'ATTACK',
  ShiftLeft: 'DODGE',
  KeyK: 'DODGE',
  KeyE: 'INTERACT',
  /** 蘇生は連打する入力なので、押しやすい位置に置く (§5.3)。 */
  KeyF: 'REVIVE',
  KeyQ: 'CHARACTER_ACTION',
};

/** WASD / Arrow Keys から移動方向への割り当て。 */
export const FORWARD_KEYS: ReadonlySet<string> = new Set(['KeyW', 'ArrowUp']);
export const BACKWARD_KEYS: ReadonlySet<string> = new Set(['KeyS', 'ArrowDown']);
export const LEFT_KEYS: ReadonlySet<string> = new Set(['KeyA', 'ArrowLeft']);
export const RIGHT_KEYS: ReadonlySet<string> = new Set(['KeyD', 'ArrowRight']);
