import { describe, expect, it } from 'vitest';

import { createVoiceBaselineCalibrator } from './voice-calibration';

const config = { threshold: 0.1, hangoverMs: 100, maxDurationMs: 1_000 };

describe('createVoiceBaselineCalibrator', () => {
  it('発話後にhangoverを超えた無音が続くと、その発話のintensityを確定する', () => {
    const calibrator = createVoiceBaselineCalibrator(config);

    calibrator.observeRms(0.3, 0);
    calibrator.observeRms(0.5, 50);
    calibrator.observeRms(0, 149);

    expect(calibrator.isComplete()).toBe(false);

    calibrator.observeRms(0, 150);

    expect(calibrator.isComplete()).toBe(true);
    expect(calibrator.getBaselineIntensity()).toBeCloseTo((0.5 - 0.1) / 0.9);
  });

  it('maxDurationに達した発話も基準音量として確定する', () => {
    const calibrator = createVoiceBaselineCalibrator({ ...config, maxDurationMs: 200 });

    calibrator.observeRms(0.4, 1_000);
    calibrator.observeRms(0.4, 1_200);

    expect(calibrator.getBaselineIntensity()).toBeCloseTo((0.4 - 0.1) / 0.9);
  });

  it('確定後は後続発話で基準音量を上書きせず、reset後に再計測できる', () => {
    const calibrator = createVoiceBaselineCalibrator(config);

    calibrator.observeRms(0.3, 0);
    calibrator.observeRms(0, 100);
    calibrator.observeRms(0, 300);
    const firstBaseline = calibrator.getBaselineIntensity();

    calibrator.observeRms(0.8, 400);
    calibrator.observeRms(0, 500);
    calibrator.observeRms(0, 700);

    expect(calibrator.getBaselineIntensity()).toBe(firstBaseline);

    calibrator.reset();
    expect(calibrator.isComplete()).toBe(false);
    expect(calibrator.getBaselineIntensity()).toBeUndefined();
  });
});
