import { create } from 'zustand';

interface FirstPersonHealthHudState {
  readonly visible: boolean;
  readonly hp: number;
  readonly hpMax: number;
  show: (hp: number, hpMax: number) => void;
  hide: () => void;
}

/** Canvas外の一人称HUDへ渡す、Client-localな表示状態。 */
export const useFirstPersonHealthHudStore = create<FirstPersonHealthHudState>((set) => ({
  visible: false,
  hp: 0,
  hpMax: 0,
  show: (hp, hpMax) => set({ visible: true, hp, hpMax }),
  hide: () => set({ visible: false }),
}));
