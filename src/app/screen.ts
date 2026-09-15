import { create } from 'zustand';

import { currentRoute, navigateToScreen } from './route';
export type Screen = 'TITLE' | 'INTRO' | 'BATTLE' | 'WORLD' | 'MATCHING' | 'GAME';
export type GameMode = 'SINGLE' | 'MULTIPLAYER';

interface ScreenStore {
  screen: Screen;
  mode: GameMode;
  selectMode: (mode: GameMode) => void;
  goTo: (screen: Screen) => void;
}

function initialScreen(): Screen {
  const route = currentRoute();
  return route === 'ORA_DEBUG' ? 'TITLE' : route;
}

export const useScreenStore = create<ScreenStore>((set) => ({
  screen: initialScreen(),
  // `/intro` などを直接開いた場合は、従来どおりマルチプレイへ進める。
  mode: 'MULTIPLAYER',
  selectMode: (mode) => set({ mode }),
  goTo: (screen) => {
    set({ screen });
    navigateToScreen(screen);
  },
}));
