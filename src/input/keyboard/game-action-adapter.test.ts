import { afterEach, describe, expect, it } from 'vitest';

import type { GameAction } from '@/game/types/game-action';

import { attachKeyboardGameActions, type KeyboardGameActionAdapter } from './game-action-adapter';

/**
 * 購読解除を afterEach へ寄せる。テスト本体の末尾で detach() を呼ぶと、
 * assertion が失敗した時点でそこへ到達せず window にリスナーが残り、
 * 後続テストへ影響する実行順依存の Flaky になるため
 * (docs/testing-strategy.md §14)。
 */
let adapter: KeyboardGameActionAdapter | undefined;

afterEach(() => {
  adapter?.detach();
  adapter = undefined;
});

function setup() {
  const actions: GameAction[] = [];
  adapter = attachKeyboardGameActions((action) => actions.push(action));
  return { actions, adapter };
}

function press(code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, ...init }));
}

function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('キーボードから全アクションを出せる', () => {
  it('攻撃・回避・蘇生・インタラクト・キャラ固有がすべて出る', () => {
    const { actions } = setup();

    press('Space');
    press('ShiftLeft');
    press('KeyE');
    press('KeyF');
    press('KeyR');
    press('KeyQ');

    expect(actions.map((action) => action.type)).toEqual([
      'ATTACK',
      'DODGE',
      'REVIVE',
      'REVIVE',
      'INTERACT',
      'CHARACTER_ACTION',
    ]);
  });

  it('割り当てのないキーは何も出さない', () => {
    const { actions } = setup();
    press('KeyZ');
    expect(actions).toEqual([]);
  });

  it('キーリピートで離散アクションが連射されない', () => {
    const { actions } = setup();

    press('Space');
    press('Space', { repeat: true });
    press('Space', { repeat: true });

    expect(actions).toHaveLength(1);
  });
});

describe('移動入力', () => {
  it('押している間の方向が取り出せる', () => {
    const { adapter: input } = setup();

    press('KeyW');
    expect(input.pollMove()).toEqual({ type: 'MOVE', input: { forward: 1, right: 0 } });

    press('KeyD');
    expect(input.pollMove().input).toEqual({ forward: 1, right: 1 });
  });

  it('離すと止まる', () => {
    const { adapter: input } = setup();

    press('KeyW');
    release('KeyW');

    expect(input.pollMove().input).toEqual({ forward: 0, right: 0 });
  });

  it('同じ方向の別キーを同時に押しても速さが倍にならない', () => {
    const { adapter: input } = setup();

    press('KeyW');
    press('ArrowUp');

    expect(input.pollMove().input).toEqual({ forward: 1, right: 0 });
  });

  it('反対方向を同時に押すと打ち消し合う', () => {
    const { adapter: input } = setup();

    press('KeyW');
    press('KeyS');

    expect(input.pollMove().input.forward).toBe(0);
  });

  it('矢印キーでページがスクロールしない', () => {
    setup();
    const event = new KeyboardEvent('keydown', { code: 'ArrowUp', cancelable: true });
    window.dispatchEvent(event);

    // 止めないと移動のたびに画面全体が動いて操作できない。
    expect(event.defaultPrevented).toBe(true);
  });

  it('フォーカスが外れると移動し続けない', () => {
    const { adapter: input } = setup();

    press('KeyW');
    window.dispatchEvent(new Event('blur'));

    expect(input.pollMove().input).toEqual({ forward: 0, right: 0 });
  });
});

describe('購読の後始末', () => {
  it('detach するとイベントを受け取らなくなる', () => {
    const { actions, adapter: input } = setup();

    input.detach();
    press('Space');

    expect(actions).toEqual([]);
  });
});
