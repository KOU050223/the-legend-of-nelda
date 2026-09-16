import { describe, expect, it } from 'vitest';

import { createHandNeutralCalibrator } from './hand-calibration';
import type { HandObservation } from './types';

function left(x: number, y: number): NonNullable<HandObservation['left']> {
  return { x, y, velocityX: 0, velocityY: 0 };
}

describe('createHandNeutralCalibrator', () => {
  it('指定時間ちょうどまでの左手サンプルからNeutral座標を平均する', () => {
    const calibrator = createHandNeutralCalibrator(1_000);

    calibrator.sample(left(0.2, 0.4), 100);
    calibrator.sample(left(0.4, 0.8), 1_099);

    expect(calibrator.isComplete()).toBe(false);

    calibrator.sample(left(0.6, 1), 1_100);

    expect(calibrator.isComplete()).toBe(true);
    expect(calibrator.getNeutral()?.x).toBeCloseTo(0.4);
    expect(calibrator.getNeutral()?.y).toBeCloseTo(0.733333);
  });

  it('左手を見失うと、それまでの蓄積を破棄して再計測する', () => {
    const calibrator = createHandNeutralCalibrator(1_000);

    calibrator.sample(left(0.2, 0.3), 0);
    calibrator.sample(left(0.4, 0.5), 500);
    calibrator.sample(undefined, 600);

    expect(calibrator.isComplete()).toBe(false);
    expect(calibrator.getNeutral()).toBeUndefined();

    calibrator.sample(left(0.8, 0.7), 1_000);
    calibrator.sample(left(0.8, 0.7), 2_000);

    expect(calibrator.getNeutral()).toEqual({ x: 0.8, y: 0.7 });
  });

  it('Neutral確定後は追加サンプルで値を変えず、resetで再計測可能になる', () => {
    const calibrator = createHandNeutralCalibrator(0);

    calibrator.sample(left(0.25, 0.75), 10);
    calibrator.sample(left(0.9, 0.1), 10);

    expect(calibrator.getNeutral()).toEqual({ x: 0.25, y: 0.75 });

    calibrator.sample(left(0.5, 0.5), 20);
    expect(calibrator.getNeutral()).toEqual({ x: 0.25, y: 0.75 });

    calibrator.reset();
    expect(calibrator.isComplete()).toBe(false);
    expect(calibrator.getNeutral()).toBeUndefined();
  });
});
