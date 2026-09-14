import { describe, expect, it } from 'vitest';

import { createVoiceActivityDetector, toIntensity } from './voice-activity-detector';

const config = { threshold: 0.02, hangoverMs: 300, maxDurationMs: 1_000 };

describe('createVoiceActivityDetector', () => {
  it('閾値未満の環境ノイズだけでは発話イベントを出さない', () => {
    const detector = createVoiceActivityDetector(config);

    const event = detector.update(0.019, 100);

    expect(event).toBeNull();
    expect(detector.getState()).toBe('silence');
  });

  it('発話後にhangoverを超えた無音が続くと特徴量を確定する', () => {
    const detector = createVoiceActivityDetector(config);
    detector.update(0.2, 100);
    detector.update(0.6, 400);

    const event = detector.update(0, 700);

    expect(event).toEqual({ type: 'WASSHOI', intensity: expect.any(Number), durationMs: 300 });
    expect(event?.intensity).toBeCloseTo((0.6 - 0.02) / 0.98);
    expect(detector.getState()).toBe('silence');
  });

  it('hangover内の短い無音では発話を分断しない', () => {
    const detector = createVoiceActivityDetector(config);
    detector.update(0.4, 100);
    detector.update(0, 350);

    const event = detector.update(0.5, 380);

    expect(event).toBeNull();
    expect(detector.getState()).toBe('speaking');
    expect(detector.getDurationMs(380)).toBe(280);
  });

  it('maxDurationに達した発話を強制的に確定する', () => {
    const detector = createVoiceActivityDetector(config);
    detector.update(0.3, 0);

    const event = detector.update(0.3, 1_000);

    expect(event).toMatchObject({ type: 'WASSHOI', durationMs: 1_000 });
    expect(detector.getState()).toBe('silence');
  });

  it('無音時だけ発話判定の閾値を更新できる', () => {
    const detector = createVoiceActivityDetector(config);
    detector.setThreshold(0.1);
    expect(detector.getThreshold()).toBe(0.1);

    detector.update(0.2, 0);
    detector.setThreshold(0.5);
    expect(detector.getThreshold()).toBe(0.1);
  });
});

describe('toIntensity', () => {
  it.each([
    { rms: 0.01, expected: 0 },
    { rms: 0.02, expected: 0 },
    { rms: 1.5, expected: 1 },
  ])('RMS $rms を0〜1へ収める', ({ rms, expected }) => {
    const intensity = toIntensity(rms, 0.02);

    expect(intensity).toBe(expected);
  });
});
