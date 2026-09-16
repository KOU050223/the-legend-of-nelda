import type { HandObservation } from './types';

export interface OraActionRecognizerOptions {
  maxY?: number;
  minSpread?: number;
  holdMs?: number;
  cooldownMs?: number;
}

export interface OraActionState {
  /** 0〜1。Debug UI(フェーズ6)の進捗表示に使う想定。 */
  progress: number;
  /** ポーズ条件を今のフレームで満たしているか。 */
  isHolding: boolean;
  /** このフレームでちょうど発動したか（1回だけtrueになる）。 */
  triggered: boolean;
}

export interface OraActionRecognizer {
  update(
    left: HandObservation['left'],
    right: HandObservation['right'],
    now: number,
  ): OraActionState;
  reset(): void;
}

const defaults: Required<OraActionRecognizerOptions> = {
  maxY: 0.45,
  minSpread: 0.35,
  holdMs: 700,
  cooldownMs: 1_000,
};

export function createOraActionRecognizer(
  options: OraActionRecognizerOptions = {},
): OraActionRecognizer {
  const config = {
    maxY: options.maxY ?? defaults.maxY,
    minSpread: options.minSpread ?? defaults.minSpread,
    holdMs: Math.max(0, options.holdMs ?? defaults.holdMs),
    cooldownMs: Math.max(0, options.cooldownMs ?? defaults.cooldownMs),
  };
  let holdStartedAt: number | undefined;
  let holdSessionConsumed = false;
  let lastTriggeredAt = Number.NEGATIVE_INFINITY;

  return {
    update(left, right, now) {
      const isHolding =
        left?.isOpen === true &&
        right?.isOpen === true &&
        left.y <= config.maxY &&
        right.y <= config.maxY &&
        Math.abs(left.x - right.x) >= config.minSpread;

      if (!isHolding) {
        holdStartedAt = undefined;
        holdSessionConsumed = false;
        return { progress: 0, isHolding: false, triggered: false };
      }

      if (holdStartedAt === undefined) holdStartedAt = now;

      const progress =
        config.holdMs === 0 ? 1 : Math.min(1, Math.max(0, (now - holdStartedAt) / config.holdMs));
      let triggered = false;
      if (progress >= 1 && !holdSessionConsumed) {
        // Cooldown中に到達したHoldも消費し、解除なしの時間経過だけでは再発動させない。
        holdSessionConsumed = true;
        if (now - lastTriggeredAt >= config.cooldownMs) {
          triggered = true;
          lastTriggeredAt = now;
        }
      }

      return { progress, isHolding: true, triggered };
    },
    reset() {
      holdStartedAt = undefined;
      holdSessionConsumed = false;
      lastTriggeredAt = Number.NEGATIVE_INFINITY;
    },
  };
}
