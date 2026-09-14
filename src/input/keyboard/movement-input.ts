import type { MovementInput } from '@/game/movement/types';

import { isFromInteractiveElement } from './interactive-element';
import type { KeyboardEventTarget } from './keyboard-adapter';

/** WASD / Arrow Keys から MovementInput の各方向成分への割り当て。 */
const FORWARD_KEYS: ReadonlySet<string> = new Set(['KeyW', 'ArrowUp']);
const BACKWARD_KEYS: ReadonlySet<string> = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS: ReadonlySet<string> = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS: ReadonlySet<string> = new Set(['KeyD', 'ArrowRight']);

const MOVEMENT_KEYS: ReadonlySet<string> = new Set([
  ...FORWARD_KEYS,
  ...BACKWARD_KEYS,
  ...LEFT_KEYS,
  ...RIGHT_KEYS,
]);

/** pressed のうち、keys のいずれかが含まれているか。 */
function isAnyPressed(pressed: ReadonlySet<string>, keys: ReadonlySet<string>): boolean {
  for (const code of pressed) {
    if (keys.has(code)) return true;
  }
  return false;
}

export interface MovementInputAdapterOptions {
  target?: KeyboardEventTarget;
}

export interface MovementInputAdapter {
  /** 現在押されているキーから MovementInput を作る。 */
  getInput(): MovementInput;
  /** 購読解除。 */
  detach(): void;
}

/**
 * 押しっぱなし状態を追跡する Input Adapter。
 *
 * keyboard-adapter.ts の attachKeyboardInput は「押した瞬間」だけを
 * PlayerAction へ変換する keydown 専用アダプタで、`event.repeat` を弾くため
 * 移動のような「押している間」の状態は表現できない。
 * WASD / Arrow Keys は戦闘入力 (DODGE / GUARD) とキーが重複しているが、
 * それらは動作モードが異なる (戦闘 = 押した瞬間、移動 = 押している間) ため
 * 独立したアダプタとして持ち、キー割り当てそのものは変更しない。
 */
export function attachMovementInput(
  options: MovementInputAdapterOptions = {},
): MovementInputAdapter {
  const target = options.target ?? window;
  const pressed = new Set<string>();

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!MOVEMENT_KEYS.has(event.code)) return;
    if (isFromInteractiveElement(event)) return;
    pressed.add(event.code);
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };

  // フォーカスがウィンドウ外へ移ると keyup が来ないキーが残り得る
  // (Alt+Tab など)。押しっぱなし状態が解除されず移動し続けるのを防ぐ。
  const handleBlur = (): void => {
    pressed.clear();
  };

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('blur', handleBlur);

  return {
    getInput() {
      // 同じ方向に割り当たったキー (例: KeyW と ArrowUp) を同時に押しても
      // その方向へは1のままにする。押されたキーをそのまま加算すると
      // W+ArrowUp+D が {forward: 2, right: 1} になり、normalize後の斜め方向が
      // 実際の入力と食い違うため (moveCharacter は forward/right を等価な
      // 軸の強さとして扱う)。
      const forward =
        (isAnyPressed(pressed, FORWARD_KEYS) ? 1 : 0) -
        (isAnyPressed(pressed, BACKWARD_KEYS) ? 1 : 0);
      const right =
        (isAnyPressed(pressed, RIGHT_KEYS) ? 1 : 0) - (isAnyPressed(pressed, LEFT_KEYS) ? 1 : 0);

      return { forward, right };
    },
    detach() {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('blur', handleBlur);
    },
  };
}
