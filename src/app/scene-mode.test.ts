import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENE, requestedScene } from './scene-mode';

describe('起動するシーンの選択', () => {
  it('指定が無ければ既定のシーンになる', () => {
    expect(requestedScene('')).toBe(DEFAULT_SCENE);
    expect(requestedScene('?other=1')).toBe(DEFAULT_SCENE);
  });

  it('名前を指定するとそのシーンになる', () => {
    expect(requestedScene('?scene=world')).toBe('world');
    expect(requestedScene('?scene=boss')).toBe('boss');
    expect(requestedScene('?scene=combat')).toBe('combat');
  });

  it('ボス戦の入口が生きている (#58)', () => {
    // ここが既定へ落ちると、ボス戦画面へ到達する経路が消える。
    // タイトル画面の導入 (#63) でシーン選択の仕組みが変わったので、
    // 動作確認手順が黙って壊れないよう固定しておく。
    expect(requestedScene('?scene=boss')).toBe('boss');
  });

  it('知らない名前は既定へ落ちる', () => {
    // URL を手で書き換えた結果で画面が真っ白になるより、
    // 既定の画面が出た方が状況が分かる。
    expect(requestedScene('?scene=nonsense')).toBe(DEFAULT_SCENE);
    expect(requestedScene('?scene=')).toBe(DEFAULT_SCENE);
  });
});
