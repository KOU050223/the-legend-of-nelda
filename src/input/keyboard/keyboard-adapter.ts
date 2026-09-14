import type { PlayerAction } from '@/game/types';

import { isFromInteractiveElement } from './interactive-element';
import { DEFAULT_KEY_BINDINGS } from './key-bindings';

export type PlayerActionListener = (action: PlayerAction) => void;

/**
 * keydown を購読できる対象。テストから差し替えられるよう window 全体を要求しない。
 * WindowEventMap 経由で型付けし、EventListener へのキャストを避ける。
 */
export type KeyboardEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface KeyboardAdapterOptions {
  bindings?: Readonly<Record<string, PlayerAction>>;
  target?: KeyboardEventTarget;
}

/**
 * DOM の KeyboardEvent を PlayerAction へ変換して通知する Input Adapter。
 * Game Logic へ KeyboardEvent を直接渡さない。
 * (docs/technical-design.md §5.2)
 *
 * @returns 購読解除関数
 */
export function attachKeyboardInput(
  onAction: PlayerActionListener,
  options: KeyboardAdapterOptions = {},
): () => void {
  const bindings = options.bindings ?? DEFAULT_KEY_BINDINGS;
  const target = options.target ?? window;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;

    // 設定UIなどを操作している間はゲーム入力にしない。preventDefault() まで
    // 進むとスライダーもチェックボックスも動かせなくなる。
    if (isFromInteractiveElement(event)) return;

    const action = bindings[event.code];
    if (action === undefined) return;

    event.preventDefault();
    onAction(action);
  };

  target.addEventListener('keydown', handleKeyDown);
  return () => {
    target.removeEventListener('keydown', handleKeyDown);
  };
}
