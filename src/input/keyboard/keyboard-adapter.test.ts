import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlayerAction } from '@/game/types';

import { attachKeyboardInput } from './keyboard-adapter';

function dispatchKey(code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, ...init }));
}

/**
 * 購読解除を afterEach へ寄せる。テスト本体の末尾で detach() を呼ぶと、
 * assertion が失敗した時点でそこへ到達せず window にリスナーが残り、
 * 後続テストへ影響する実行順依存の Flaky になるため
 * (docs/testing-strategy.md §14)。
 * detach は removeEventListener のみのため、二重呼び出しは無害。
 */
let detach: (() => void) | undefined;

afterEach(() => {
  detach?.();
  detach = undefined;
});

describe('attachKeyboardInput', () => {
  it('割り当てられたキーをPlayerActionへ変換する', () => {
    const actions: PlayerAction[] = [];
    detach = attachKeyboardInput((action) => actions.push(action));

    dispatchKey('ArrowLeft');
    dispatchKey('Space');

    expect(actions).toEqual(['DODGE_LEFT', 'ATTACK']);
  });

  it('未割り当てのキーは無視する', () => {
    const onAction = vi.fn<(action: PlayerAction) => void>();
    detach = attachKeyboardInput(onAction);

    dispatchKey('KeyQ');

    expect(onAction).not.toHaveBeenCalled();
  });

  it('キーリピートは無視する', () => {
    const onAction = vi.fn<(action: PlayerAction) => void>();
    detach = attachKeyboardInput(onAction);

    dispatchKey('ArrowLeft', { repeat: true });

    expect(onAction).not.toHaveBeenCalled();
  });

  it('購読解除後はコールバックを呼ばない', () => {
    const onAction = vi.fn<(action: PlayerAction) => void>();
    detach = attachKeyboardInput(onAction);
    // 購読解除そのものがこのテストの対象なので、ここで明示的に呼ぶ。
    detach();

    dispatchKey('ArrowLeft');

    expect(onAction).not.toHaveBeenCalled();
  });
});
