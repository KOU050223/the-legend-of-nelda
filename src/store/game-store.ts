import { create } from 'zustand';

import type { CombatState, JudgeResult, PlayerAction } from '@/game/types';

/**
 * 表示のために共有する状態。docs/technical-design.md §9。
 * Presentation State が Game Logic を書き換えないよう、
 * 戦闘ルールそのものはここではなく src/game/ 側へ置く。
 */
interface GameStore {
  combatState: CombatState;
  bossHp: number;
  sleepiness: number;
  lastAction: PlayerAction | null;
  lastResult: JudgeResult | null;

  setCombatState: (state: CombatState) => void;
  setBossHp: (hp: number) => void;
  setSleepiness: (value: number) => void;
  recordAction: (action: PlayerAction) => void;
  recordResult: (result: JudgeResult) => void;
}

export const INITIAL_BOSS_HP = 100;

export const useGameStore = create<GameStore>((set) => ({
  combatState: 'INTRO',
  bossHp: INITIAL_BOSS_HP,
  sleepiness: 0,
  lastAction: null,
  lastResult: null,

  setCombatState: (combatState) => set({ combatState }),
  setBossHp: (bossHp) => set({ bossHp }),
  setSleepiness: (sleepiness) => set({ sleepiness }),
  recordAction: (lastAction) => set({ lastAction }),
  recordResult: (lastResult) => set({ lastResult }),
}));
