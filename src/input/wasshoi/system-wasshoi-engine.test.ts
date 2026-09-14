import { describe, expect, it } from 'vitest';

import { toWasshoiPlaybackParameters } from './system-wasshoi-engine';

describe('toWasshoiPlaybackParameters', () => {
  it('小声で短い発話は小さく短いわっしょーいにする', () => {
    const parameters = toWasshoiPlaybackParameters({
      type: 'WASSHOI',
      intensity: 0.15,
      durationMs: 250,
    });

    expect(parameters.gain).toBeCloseTo(0.143);
    expect(parameters.phraseDurationMs).toBe(557.5);
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

    expect(loudLong.gain).toBeGreaterThan(quietShort.gain);
    expect(loudLong.phraseDurationMs).toBeGreaterThan(quietShort.phraseDurationMs);
    expect(loudLong.playbackRate).toBeLessThan(quietShort.playbackRate);
  });
});
