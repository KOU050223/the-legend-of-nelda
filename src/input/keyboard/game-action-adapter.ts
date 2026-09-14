import type {
  AttachInputAdapter,
  DiscreteGameActionType,
  GameAction,
  GameActionListener,
  InputAdapter,
} from '@/game/types/game-action';
import type { MovementInput } from '@/game/movement/types';

import { isFromInteractiveElement } from './interactive-element';
import {
  BACKWARD_KEYS,
  FORWARD_KEYS,
  LEFT_KEYS,
  PHASE2_KEY_BINDINGS,
  RIGHT_KEYS,
} from './game-action-bindings';
import type { KeyboardEventTarget } from './keyboard-adapter';

/**
 * Keyboard を `GameAction` へ変換する Phase 2 の Input Adapter。(#55)
 *
 * Phase 1 の `attachKeyboardInput` は置き換えない。あちらは `PlayerAction`
 * を出し、Phase 1 の戦闘一式がそれに乗っている (game-action.ts 冒頭の
 * 「併存させる」を参照)。
 *
 * 離散アクションは keydown の瞬間に流す。移動だけは押しっぱなしの状態なので、
 * `pollMove()` を毎フレーム呼んで現在の方向を取り出す形にしてある。
 * keydown をそのまま毎フレームのイベントへ変えると、キーリピートの間隔
 * (OS依存) に移動速度が引きずられる。
 *
 * ARマーカー / マイクの Adapter も `AttachInputAdapter` を満たす形で足せば、
 * Game Logic 側は入力元を知らないまま同じ `GameAction` を受け取る。
 */

export interface GameActionAdapterOptions {
  bindings?: Readonly<Record<string, DiscreteGameActionType>>;
  target?: KeyboardEventTarget;
}

export interface KeyboardGameActionAdapter extends InputAdapter {
  /**
   * 現在の移動入力を `MOVE` として取り出す。押されていなければ
   * `{forward: 0, right: 0}` を持つ MOVE を返すので、呼び出し側は
   * 「入力が無い」も同じ経路で扱える。
   */
  pollMove(): Extract<GameAction, { type: 'MOVE' }>;
}

/** pressed のうち、keys のいずれかが含まれているか。 */
function isAnyPressed(pressed: ReadonlySet<string>, keys: ReadonlySet<string>): boolean {
  for (const code of pressed) {
    if (keys.has(code)) return true;
  }
  return false;
}

export function attachKeyboardGameActions(
  onAction: GameActionListener,
  options: GameActionAdapterOptions = {},
): KeyboardGameActionAdapter {
  const bindings = options.bindings ?? PHASE2_KEY_BINDINGS;
  const target = options.target ?? window;
  const pressed = new Set<string>();

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isFromInteractiveElement(event)) return;

    // 移動キーは押しっぱなしを追跡する。repeat も含めて記録してよい。
    pressed.add(event.code);

    // 離散アクションはキーリピートで連射させない。
    if (event.repeat) return;

    const actionType = bindings[event.code];
    if (actionType === undefined) return;

    event.preventDefault();
    onAction({ type: actionType });
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };

  // フォーカスが外れると keyup が来ないキーが残り得る (Alt+Tab など)。
  const handleBlur = (): void => {
    pressed.clear();
  };

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('blur', handleBlur);

  return {
    pollMove() {
      // 同じ方向の別キー (KeyW と ArrowUp) を同時に押しても1のままにする。
      // 加算すると normalize 後の斜め方向が実際の入力と食い違う。
      const forward =
        (isAnyPressed(pressed, FORWARD_KEYS) ? 1 : 0) -
        (isAnyPressed(pressed, BACKWARD_KEYS) ? 1 : 0);
      const right =
        (isAnyPressed(pressed, RIGHT_KEYS) ? 1 : 0) - (isAnyPressed(pressed, LEFT_KEYS) ? 1 : 0);

      const input: MovementInput = { forward, right };
      return { type: 'MOVE', input };
    },
    detach() {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('blur', handleBlur);
    },
  };
}

/**
 * 共通契約 (`AttachInputAdapter`) を満たす形。
 *
 * 移動を `pollMove()` で取り出さず、押しっぱなしの状態も毎回の通知として
 * 受け取りたい呼び出し側向け。ARマーカーの Adapter を足すときは、
 * この形に揃えれば Game Logic 側は入力元を知らないまま繋がる。
 */
export const attachKeyboardInputAdapter: AttachInputAdapter = (onAction) => {
  const adapter = attachKeyboardGameActions(onAction);
  return {
    detach() {
      adapter.detach();
    },
  };
};
