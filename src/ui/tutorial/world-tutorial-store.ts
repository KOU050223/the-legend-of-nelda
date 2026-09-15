import { create } from 'zustand';

interface WorldTutorialState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const useWorldTutorialStore = create<WorldTutorialState>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
}));
