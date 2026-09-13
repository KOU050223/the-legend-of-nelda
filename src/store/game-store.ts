import { create } from 'zustand';

import { INITIAL_BOSS_HP, INITIAL_SLEEPINESS } from '@/game/config/combat-balance';
import type { AttackId } from '@/game/config/combat-balance';
import type { InputRejectionReason } from '@/game/events/game-event';
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
  /** 直近で判定された技。技固有のイベント文言を選ぶ表示用の情報。 */
  lastAttackId: AttackId | null;
  /** 判定前に弾かれた入力。通常の被弾結果とは区別して表示する。 */
  lastInputRejection: InputRejectionReason | null;
  lastResult: JudgeResult | null;
  /** 同じ文言の連続イベントも再表示するための単調増加ID。 */
  eventSequence: number;

  setCombatState: (state: CombatState) => void;
  setBossHp: (hp: number) => void;
  setSleepiness: (value: number) => void;
  recordAction: (action: PlayerAction) => void;
  recordAttack: (attackId: AttackId | null) => void;
  recordInputRejection: (reason: InputRejectionReason | null) => void;
  recordResult: (result: JudgeResult) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  combatState: 'INTRO',
  bossHp: INITIAL_BOSS_HP,
  sleepiness: INITIAL_SLEEPINESS,
  lastAction: null,
  lastAttackId: null,
  lastInputRejection: null,
  lastResult: null,
  eventSequence: 0,

  setCombatState: (combatState) => set({ combatState }),
  setBossHp: (bossHp) => set({ bossHp }),
  setSleepiness: (sleepiness) => set({ sleepiness }),
  recordAction: (lastAction) => set({ lastAction }),
  recordAttack: (lastAttackId) => set({ lastAttackId }),
  recordInputRejection: (lastInputRejection) =>
    set((state) => ({ lastInputRejection, eventSequence: state.eventSequence + 1 })),
  recordResult: (lastResult) =>
    set((state) => ({
      lastResult,
      lastInputRejection: null,
      eventSequence: state.eventSequence + 1,
    })),
}));
