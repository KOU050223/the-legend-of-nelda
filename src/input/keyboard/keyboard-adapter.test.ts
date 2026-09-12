import { describe, expect, it, vi } from 'vitest';

import type { PlayerAction } from '@/game/types';

import { attachKeyboardInput } from './keyboard-adapter';

function dispatchKey(code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, ...init }));
}

describe('attachKeyboardInput', () => {
  it('割り当てられたキーをPlayerActionへ変換する', () => {
    const actions: PlayerAction[] = [];
    const detach = attachKeyboardInput((action) => actions.push(action));

    dispatchKey('ArrowLeft');
    dispatchKey('Space');

    expect(actions).toEqual(['DODGE_LEFT', 'ATTACK']);
    detach();
  });

  it('未割り当てのキーは無視する', () => {
    const onAction = vi.fn<(action: PlayerAction) => void>();
    const detach = attachKeyboardInput(onAction);

    dispatchKey('KeyQ');

    expect(onAction).not.toHaveBeenCalled();
    detach();
  });

  it('キーリピートは無視する', () => {
    const onAction = vi.fn<(action: PlayerAction) => void>();
    const detach = attachKeyboardInput(onAction);

    dispatchKey('ArrowLeft', { repeat: true });

    expect(onAction).not.toHaveBeenCalled();
    detach();
  });

  it('購読解除後はコールバックを呼ばない', () => {
    const onAction = vi.fn<(action: PlayerAction) => void>();
    const detach = attachKeyboardInput(onAction);
    detach();

    dispatchKey('ArrowLeft');

    expect(onAction).not.toHaveBeenCalled();
  });
});
