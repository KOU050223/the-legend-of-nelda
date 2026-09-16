import { REVIVE_INPUT_INTERVAL_MS } from '@/game/config/phase2-player-balance';

import type { HandObservation } from './types';

export interface OraReviveRecognizerOptions {
  maxHandDistance?: number;
  inputIntervalMs?: number;
}

export interface OraReviveState {
  isHolding: boolean;
  triggered: boolean;
}

export interface OraReviveRecognizer {
  update(
    left: HandObservation['left'],
    right: HandObservation['right'],
    now: number,
  ): OraReviveState;
  reset(): void;
}

const defaults = {
  maxHandDistance: 0.22,
  inputIntervalMs: REVIVE_INPUT_INTERVAL_MS + 16,
} as const;

export const ORA_REVIVE_INPUT_INTERVAL_MS = defaults.inputIntervalMs;

/** 合掌をREVIVEの連打入力へ変換する純粋なフレーム認識器。 */
export function createOraReviveRecognizer(
  options: OraReviveRecognizerOptions = {},
): OraReviveRecognizer {
  const maxHandDistance = options.maxHandDistance ?? defaults.maxHandDistance;
  const inputIntervalMs = Math.max(0, options.inputIntervalMs ?? defaults.inputIntervalMs);
  let lastTriggeredAt = Number.NEGATIVE_INFINITY;

  function isHolding(left: HandObservation['left'], right: HandObservation['right']): boolean {
    return (
      left?.isClosed === true &&
      right?.isClosed === true &&
      Math.hypot(left.x - right.x, left.y - right.y) <= maxHandDistance
    );
  }

  return {
    update(left, right, now) {
      if (!isHolding(left, right)) {
        lastTriggeredAt = Number.NEGATIVE_INFINITY;
        return { isHolding: false, triggered: false };
      }

      const triggered = now - lastTriggeredAt >= inputIntervalMs;
      if (triggered) lastTriggeredAt = now;
      return { isHolding: true, triggered };
    },
    reset() {
      lastTriggeredAt = Number.NEGATIVE_INFINITY;
    },
  };
}
