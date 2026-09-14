import { describe, expect, it } from 'vitest';

import { toWasshoiPlaybackParameters } from './system-wasshoi-engine';

describe('toWasshoiPlaybackParameters', () => {
  it('小声で短い発話は小さく短いわっしょーいにする', () => {
    const parameters = toWasshoiPlaybackParameters({
      type: 'WASSHOI',
      intensity: 0.15,
      durationMs: 250,
    });

    expect(parameters.volume).toBeCloseTo(0.2775);
    expect(parameters.rate).toBeCloseTo(1.472);
    expect(parameters.phrase).toBe('わっしょい！');
  });

  it('大声で長い発話は大きく長いわっしょーいにする', () => {
    const quietShort = toWasshoiPlaybackParameters({
      type: 'WASSHOI',
      intensity: 0.15,
      durationMs: 250,
    });
    const loudLong = toWasshoiPlaybackParameters({
      type: 'WASSHOI',
      intensity: 0.9,
      durationMs: 2_000,
    });

    expect(loudLong.volume).toBeGreaterThan(quietShort.volume);
    expect(loudLong.rate).toBeLessThan(quietShort.rate);
    expect(loudLong.phrase).toBe('わっしょおおおーい！');
  });

  it('同じ発話でもバリエーションごとにピッチと話速を変える', () => {
    const event = { type: 'WASSHOI' as const, intensity: 0.5, durationMs: 800 };
    const low = toWasshoiPlaybackParameters(event, 0);
    const high = toWasshoiPlaybackParameters(event, 2);

    expect(high.pitch).toBeGreaterThan(low.pitch);
    expect(high.rate).toBeGreaterThan(low.rate);
  });
});
