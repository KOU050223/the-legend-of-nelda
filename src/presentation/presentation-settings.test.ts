import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRESENTATION_SETTINGS,
  audioScale,
  clampIntensity,
  visualScale,
} from './presentation-settings';

describe('演出強度', () => {
  it('既定では演出がそのままの強さで出る', () => {
    expect(audioScale(DEFAULT_PRESENTATION_SETTINGS)).toBe(1);
    expect(visualScale(DEFAULT_PRESENTATION_SETTINGS)).toBe(1);
  });

  it.each([
    [0.5, 0.5],
    [2, 2],
    [0, 0],
  ])('強度 %s が演出へそのまま掛かる', (intensity, expected) => {
    expect(clampIntensity(intensity)).toBe(expected);
  });

  it.each([-1, Number.NaN])('不正な強度 %s は演出を反転させず0で止まる', (intensity) => {
    expect(clampIntensity(intensity)).toBe(0);
  });

  it('音と絵を個別に切れる', () => {
    const audioOff = { ...DEFAULT_PRESENTATION_SETTINGS, audioEnabled: false };

    expect(audioScale(audioOff)).toBe(0);
    expect(visualScale(audioOff)).toBe(1);
  });

  it('切っている間は強度を上げても演出が出ない', () => {
    // OFF と強度は別軸。OFF を解除したときに元の強さへ戻せる。
    const settings = { ...DEFAULT_PRESENTATION_SETTINGS, visualEnabled: false, visualIntensity: 2 };

    expect(visualScale(settings)).toBe(0);
    expect({ ...settings, visualEnabled: true }).toMatchObject({ visualIntensity: 2 });
  });
});
