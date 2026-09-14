import { create } from 'zustand';

import { isWorldSceneRequested } from './scene-mode';

/**
 * ルートに出す画面。Issue #63 でタイトルを入口にしたが、ルーターは足していない。
 * 画面数が「タイトル / 戦闘 / ワールド」の3つで、URLを共有したい要求も
 * 出ていないため、依存を増やさず store だけで切り替える。
 */
export type Screen = 'TITLE' | 'BATTLE' | 'WORLD';

interface ScreenStore {
  screen: Screen;
  goTo: (screen: Screen) => void;
}

/**
 * `?scene=world` を踏んだときはタイトルを挟まない。既存の動作確認手順
 * (scene-mode.ts) をタイトル経由に変えてしまわないため。
 */
function initialScreen(): Screen {
  return isWorldSceneRequested() ? 'WORLD' : 'TITLE';
}

export const useScreenStore = create<ScreenStore>((set) => ({
  screen: initialScreen(),
  goTo: (screen) => set({ screen }),
}));
