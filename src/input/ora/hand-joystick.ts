import type { MovementInput } from '@/game/movement/types';

import type { HandObservation } from './types';

export interface HandJoystickOptions {
  deadZoneEnter?: number;
  deadZoneRelease?: number;
  maxDistance?: number;
  smoothing?: number;
}

export interface HandJoystick {
  /** 手またはNeutralを見失ったら、EMAとヒステリシスを含む内部状態を初期化する。 */
  update(
    left: HandObservation['left'],
    neutral: { x: number; y: number } | undefined,
    now: number,
  ): MovementInput;
  reset(): void;
}

const defaults: Required<HandJoystickOptions> = {
  deadZoneEnter: 0.1,
  deadZoneRelease: 0.08,
  maxDistance: 0.35,
  smoothing: 0.35,
};

const neutralInput = (): MovementInput => ({ forward: 0, right: 0 });

/** 左手の位置を半径ベースの連続移動入力へ変換する。 */
export function createHandJoystick(options: HandJoystickOptions = {}): HandJoystick {
  const config = {
    deadZoneEnter: options.deadZoneEnter ?? defaults.deadZoneEnter,
    deadZoneRelease: options.deadZoneRelease ?? defaults.deadZoneRelease,
    maxDistance: Math.max(Number.EPSILON, options.maxDistance ?? defaults.maxDistance),
    smoothing: Math.min(1, Math.max(0, options.smoothing ?? defaults.smoothing)),
  };
  let smoothed: { x: number; y: number } | undefined;
  let active = false;

  const resetState = (): void => {
    smoothed = undefined;
    active = false;
  };

  return {
    update(left, neutral, _now) {
      if (!left || !neutral) {
        resetState();
        return neutralInput();
      }

      if (!smoothed) {
        smoothed = { x: left.x, y: left.y };
      } else {
        smoothed = {
          x: smoothed.x + (left.x - smoothed.x) * config.smoothing,
          y: smoothed.y + (left.y - smoothed.y) * config.smoothing,
        };
      }

      const dx = smoothed.x - neutral.x;
      const dy = smoothed.y - neutral.y;
      const distance = Math.hypot(dx, dy);

      if (!active) {
        if (distance <= config.deadZoneEnter) return neutralInput();
        active = true;
      } else if (distance < config.deadZoneRelease) {
        active = false;
        return neutralInput();
      }

      if (distance === 0) return neutralInput();

      // 半径全体をClampしてから方向へ戻すことで、斜め入力の比率を保つ。
      const magnitude = Math.min(1, distance / config.maxDistance);
      const directionScale = magnitude / distance;
      return {
        forward: -dy * directionScale,
        right: dx * directionScale,
      };
    },
    reset: resetState,
  };
}
