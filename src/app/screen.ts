import { create } from 'zustand';

import { requestedScene } from './scene-mode';

/**
 * ルートに出す画面。Issue #63 でタイトルを入口にしたが、ルーターは足していない。
 * 画面数が少なく、URLを共有したい要求も出ていないため、依存を増やさず
 * store だけで切り替える。
 */
export type Screen = 'TITLE' | 'BATTLE' | 'WORLD';

interface ScreenStore {
  screen: Screen;
  goTo: (screen: Screen) => void;
}

/**
 * `?scene=` を踏んだときはタイトルを挟まない。既存の動作確認手順
 * (scene-mode.ts) をタイトル経由に変えてしまわないため。
 *
 * 指定が無ければタイトルから始まる。`scene-mode.ts` の既定は `combat` だが、
 * 戦闘へ直接入るのではなくタイトルを経由するのが Issue #63 以降の入口。
 */
function initialScreen(): Screen {
  return requestedScene() === 'world' ? 'WORLD' : 'TITLE';
}

export const useScreenStore = create<ScreenStore>((set) => ({
  screen: initialScreen(),
  goTo: (screen) => set({ screen }),
}));
