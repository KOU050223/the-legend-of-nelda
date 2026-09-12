import type { JudgeResult } from '../types/combat-state';

/**
 * Game Logic が発行するイベント。
 * Rendering / Audio / UI がそれぞれ購読する。
 * Game Logic から Audio API や Three.js を直接呼ばないための境界。
 * (docs/technical-design.md §6 / §15)
 */
export type GameEvent =
  | { type: 'ATTACK_TELEGRAPH'; attackId: string; visualCue: string; audioCue: string }
  | { type: 'ATTACK_HIT_TIMING'; attackId: string }
  | { type: 'JUDGED'; result: JudgeResult }
  | { type: 'BOSS_HP_CHANGED'; hp: number }
  | { type: 'SLEEPINESS_CHANGED'; value: number };

export type GameEventListener = (event: GameEvent) => void;

export interface GameEventBus {
  emit(event: GameEvent): void;
  subscribe(listener: GameEventListener): () => void;
}

export function createGameEventBus(): GameEventBus {
  const listeners = new Set<GameEventListener>();

  return {
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
