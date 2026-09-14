import { create } from 'zustand';

import { currentRoute, navigateToScreen } from './route';
export type Screen = 'TITLE' | 'BATTLE' | 'WORLD';

interface ScreenStore {
  screen: Screen;
  goTo: (screen: Screen) => void;
}

function initialScreen(): Screen {
  const route = currentRoute();
  return route === 'BATTLE' || route === 'WORLD' ? route : 'TITLE';
}

export const useScreenStore = create<ScreenStore>((set) => ({
  screen: initialScreen(),
  goTo: (screen) => {
    set({ screen });
    navigateToScreen(screen);
  },
}));
