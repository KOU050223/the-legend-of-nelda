import type { JudgeResult } from '../types/combat-state';

/**
 * Game Logic が発行するイベント。
 * Rendering / Audio / UI がそれぞれ購読する。
 * Game Logic から Audio API や Three.js を直接呼ばないための境界。
 * (docs/technical-design.md §6 / §15)
 *
 * Visual Cue と Audio Cue は別イベントに分ける。片方だけを購読する
 * レイヤーへもう片方の情報を渡さないためで、Phase 2 で
 * 見ざる / 聞かざる へ Cue を出し分ける際の前提になる
 * (docs/technical-design.md §6 / docs/testing-strategy.md §7)。
 */
export type GameEvent =
  | { type: 'ATTACK_STARTED'; attackId: string }
  | { type: 'ATTACK_VISUAL_CUE'; attackId: string; cue: string }
  | { type: 'ATTACK_AUDIO_CUE'; attackId: string; cue: string }
  | { type: 'ATTACK_HIT_TIMING'; attackId: string; at: number }
  | { type: 'ATTACK_ENDED'; attackId: string }
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
