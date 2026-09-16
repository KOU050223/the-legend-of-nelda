import type { HandObservation } from './types';

const DEFAULT_WINDOW_MS = 1_000;

export interface HandNeutralCalibrator {
  /** 左手が見えている間の位置を蓄積し、見失ったら計測をやり直す。 */
  sample(left: HandObservation['left'], now: number): void;
  isComplete(): boolean;
  getNeutral(): { x: number; y: number } | undefined;
  reset(): void;
}

/** 左手の位置を一定時間平均し、後段の入力変換から使えるNeutralを確定する。 */
export function createHandNeutralCalibrator(windowMs = DEFAULT_WINDOW_MS): HandNeutralCalibrator {
  const calibrationWindowMs = Math.max(0, windowMs);
  let startedAt: number | undefined;
  let sumX = 0;
  let sumY = 0;
  let sampleCount = 0;
  let neutral: { x: number; y: number } | undefined;

  const clear = (): void => {
    startedAt = undefined;
    sumX = 0;
    sumY = 0;
    sampleCount = 0;
    neutral = undefined;
  };

  return {
    sample(left, now) {
      if (!left) {
        clear();
        return;
      }

      if (neutral) return;
      if (startedAt === undefined) startedAt = now;

      sumX += left.x;
      sumY += left.y;
      sampleCount += 1;

      if (now - startedAt >= calibrationWindowMs) {
        neutral = {
          x: sumX / sampleCount,
          y: sumY / sampleCount,
        };
      }
    },
    isComplete: () => neutral !== undefined,
    getNeutral: () => (neutral ? { ...neutral } : undefined),
    reset: clear,
  };
}
