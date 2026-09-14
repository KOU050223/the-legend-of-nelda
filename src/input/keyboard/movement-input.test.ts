import { afterEach, describe, expect, it } from 'vitest';

import { attachMovementInput, type MovementInputAdapter } from './movement-input';

function dispatchKeyDown(code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, ...init }));
}

function dispatchKeyUp(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }));
}

/**
 * 実際の要素からキーを投げる。設定UIのスライダーを操作している状況を
 * 再現するため、target を window ではなく要素にする
 * (keyboard-adapter.test.ts と同じ手法)。
 */
function dispatchKeyDownFrom(element: HTMLElement, code: string): void {
  document.body.append(element);
  element.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true }));
  element.remove();
}

/**
 * 購読解除を afterEach へ寄せる。keyboard-adapter.test.ts と同じ理由
 * (assertion失敗時にリスナーが window に残るのを防ぐ)。
 */
let adapter: MovementInputAdapter | undefined;

afterEach(() => {
  adapter?.detach();
  adapter = undefined;
});

describe('attachMovementInput', () => {
  it('何も押していなければ forward/right ともに 0 を返す', () => {
    adapter = attachMovementInput();

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });

  it('W (前進キー) を押している間は forward = 1 を返す', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyW');

    expect(adapter.getInput()).toEqual({ forward: 1, right: 0 });
  });

  it('keyup 後は forward が 0 に戻る (押している間だけ動く)', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyW');
    dispatchKeyUp('KeyW');

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });

  it('W と D を同時に押している間は forward = 1, right = 1 を返す', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyW');
    dispatchKeyDown('KeyD');

    expect(adapter.getInput()).toEqual({ forward: 1, right: 1 });
  });

  it('ArrowUp / ArrowDown / ArrowLeft / ArrowRight でも同じ方向を返す', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('ArrowUp');
    dispatchKeyDown('ArrowRight');

    expect(adapter.getInput()).toEqual({ forward: 1, right: 1 });
  });

  it('後退・左移動キーは負の値として反映する', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyS');
    dispatchKeyDown('KeyA');

    expect(adapter.getInput()).toEqual({ forward: -1, right: -1 });
  });

  it('前進と後退のキーを同時に押すと forward は 0 で打ち消し合う', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyW');
    dispatchKeyDown('KeyS');

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });

  it('左と右のキーを同時に押すと right は 0 で打ち消し合う', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyA');
    dispatchKeyDown('KeyD');

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });

  it('同じ方向に割り当たったキー (KeyW と ArrowUp) を同時押ししても forward は 1 のまま', () => {
    // 各キーを押されたぶんだけ加算すると、KeyW + ArrowUp + KeyD が
    // {forward: 2, right: 1} になり、moveCharacter の normalize が
    // 期待する斜め方向とずれる (レビュー指摘)。
    adapter = attachMovementInput();

    dispatchKeyDown('KeyW');
    dispatchKeyDown('ArrowUp');
    dispatchKeyDown('KeyD');

    expect(adapter.getInput()).toEqual({ forward: 1, right: 1 });
  });

  it.each([
    ['スライダー', 'input'],
    ['ボタン', 'button'],
  ])('%sを操作している間はキーが移動入力にならない', (_name, tag) => {
    adapter = attachMovementInput();

    dispatchKeyDownFrom(document.createElement(tag), 'KeyW');

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });

  it('window の blur で押しっぱなし状態をクリアする (Alt+Tab等でkeyupが来ない場合の対策)', () => {
    adapter = attachMovementInput();

    dispatchKeyDown('KeyW');
    window.dispatchEvent(new Event('blur'));

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });

  it('detach 後は新たなキー入力を反映しない', () => {
    adapter = attachMovementInput();
    // detach そのものがこのテストの対象なので、ここで明示的に呼ぶ。
    adapter.detach();

    dispatchKeyDown('KeyD');

    expect(adapter.getInput()).toEqual({ forward: 0, right: 0 });
  });
});
