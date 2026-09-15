import { describe, expect, it } from 'vitest';

import { INTRO_DURATION_MS, INTRO_SHOTS, shotAt } from './cutscene-timeline';

describe('intro cutscene timeline', () => {
  it('冒頭の古代遺跡から三人の大輔のRevealまでを順番に再生する', () => {
    const openingShot = INTRO_SHOTS[0];
    if (!openingShot) throw new Error('イントロの冒頭ショットがありません');

    expect(shotAt(0).focus).toBe('RUINS_WIDE');
    expect(shotAt(openingShot.durationMs).focus).toBe('RUINS_APPROACH');
    expect(shotAt(openingShot.durationMs + 3_300).focus).toBe('HORI_INTRO');
    expect(shotAt(openingShot.durationMs + 3_300 + 1_000 + 2_100).focus).toBe('HORI_AWAKENED');
    expect(shotAt(INTRO_DURATION_MS - 1).focus).toBe('FINAL');
  });
});
