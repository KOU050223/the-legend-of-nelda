import { create } from 'zustand';

import { currentRoute, navigateToScreen } from './route';
export type Screen = 'TITLE' | 'INTRO' | 'BATTLE' | 'WORLD' | 'MATCHING' | 'GAME';

interface ScreenStore {
  screen: Screen;
  goTo: (screen: Screen) => void;
}

function initialScreen(): Screen {
  const route = currentRoute();
  return route === 'ORA_DEBUG' ? 'TITLE' : route;
}

export const useScreenStore = create<ScreenStore>((set) => ({
  screen: initialScreen(),
  goTo: (screen) => {
    set({ screen });
    navigateToScreen(screen);
  },
}));
