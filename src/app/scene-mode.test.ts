import { describe, expect, it } from 'vitest';

import { requestedScene } from './scene-mode';

describe('起動するシーンの選択', () => {
  it('指定が無ければ null', () => {
    // 「指定が無い」と「combat を明示した」を呼び出し側が区別できるよう、
    // 既定値へ丸めない。前者はタイトルから、後者は戦闘を直接開く。
    expect(requestedScene('')).toBeNull();
    expect(requestedScene('?other=1')).toBeNull();
  });

  it('名前を指定するとそのシーンになる', () => {
    expect(requestedScene('?scene=world')).toBe('world');
    expect(requestedScene('?scene=combat')).toBe('combat');
  });

  it('知らない名前は null', () => {
    // URL を手で書き換えた結果で画面が真っ白になるより、
    // 既定の画面が出た方が状況が分かる。
    expect(requestedScene('?scene=nonsense')).toBeNull();
    expect(requestedScene('?scene=')).toBeNull();
  });
});
