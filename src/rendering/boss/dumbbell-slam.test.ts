import { describe, expect, it } from 'vitest';

import {
  DUMBBELL_GROUND_HEIGHT,
  DUMBBELL_LIFT_HEIGHT,
  SHOCKWAVE_INNER_RADIUS,
  SHOCKWAVE_OUTER_RADIUS,
  dumbbellSlamStateAt,
} from './dumbbell-slam';

const TIMING = { telegraphMs: 1400, activeMs: 400 };

describe('dumbbellSlamStateAt', () => {
  it('予兆の頭ではダンベルを振り上げ始める', () => {
    const state = dumbbellSlamStateAt(0, TIMING);
    expect(state.phase).toBe('LIFT');
    expect(state.dumbbellY).toBeCloseTo(DUMBBELL_GROUND_HEIGHT);
    expect(state.shockwaveRadius).toBe(0);
  });

  it('振り上げきったら落下が始まるまで高さを保つ', () => {
    const state = dumbbellSlamStateAt(TIMING.telegraphMs * 0.6, TIMING);
    expect(state.phase).toBe('HOLD');
    expect(state.dumbbellY).toBeCloseTo(DUMBBELL_GROUND_HEIGHT + DUMBBELL_LIFT_HEIGHT);
  });

  it('予兆の終わりに向かって落ちる', () => {
    const mid = dumbbellSlamStateAt(TIMING.telegraphMs * 0.9, TIMING);
    const late = dumbbellSlamStateAt(TIMING.telegraphMs - 1, TIMING);
    expect(mid.phase).toBe('DROP');
    expect(late.phase).toBe('DROP');
    // 落下中は単調に下がる。
    expect(late.dumbbellY).toBeLessThan(mid.dumbbellY);
    // 判定の直前には地面へ着いている。
    expect(late.dumbbellY).toBeCloseTo(DUMBBELL_GROUND_HEIGHT, 1);
  });

  it('判定の頭で衝撃波が危険範囲の内径から始まる', () => {
    const state = dumbbellSlamStateAt(TIMING.telegraphMs, TIMING);
    expect(state.phase).toBe('IMPACT');
    expect(state.shockwaveRadius).toBeCloseTo(SHOCKWAVE_INNER_RADIUS);
    expect(state.shockwaveOpacity).toBeCloseTo(1);
    // 着地の瞬間は潰れている。
    expect(state.dumbbellSquash).toBeLessThan(1);
  });

  it('判定の終わりに衝撃波が危険範囲の外径へ届く', () => {
    const state = dumbbellSlamStateAt(TIMING.telegraphMs + TIMING.activeMs - 1, TIMING);
    expect(state.phase).toBe('IMPACT');
    expect(state.shockwaveRadius).toBeCloseTo(SHOCKWAVE_OUTER_RADIUS, 0);
    // 広がりきる頃にはほぼ消えている。
    expect(state.shockwaveOpacity).toBeLessThan(0.05);
  });

  it('衝撃波は判定中ずっと外へ広がり続ける', () => {
    const radii = [0, 0.25, 0.5, 0.75, 0.99].map(
      (ratio) =>
        dumbbellSlamStateAt(TIMING.telegraphMs + TIMING.activeMs * ratio, TIMING).shockwaveRadius,
    );
    // 単調増加であること。ソート済みと一致すれば途中で縮んでいない。
    expect(radii).toEqual([...radii].toSorted((a, b) => a - b));
    expect(new Set(radii).size).toBe(radii.length);
  });

  it('硬直へ入ったら何も出さない', () => {
    const state = dumbbellSlamStateAt(TIMING.telegraphMs + TIMING.activeMs, TIMING);
    expect(state.phase).toBe('NONE');
    expect(state.shockwaveOpacity).toBe(0);
  });

  it('技が始まる前は何も出さない', () => {
    expect(dumbbellSlamStateAt(-1, TIMING).phase).toBe('NONE');
  });

  it('尺が 0 でも破綻しない', () => {
    const state = dumbbellSlamStateAt(0, { telegraphMs: 0, activeMs: 0 });
    expect(state.phase).toBe('NONE');
    expect(Number.isFinite(state.shockwaveRadius)).toBe(true);
  });

  it('衝撃波は当たり判定 (RING) と同じ内径・外径を掃く', () => {
    // 演出だけが範囲を誤解させないこと。判定の形は phase2-boss-balance が持つ。
    expect(SHOCKWAVE_INNER_RADIUS).toBe(3);
    expect(SHOCKWAVE_OUTER_RADIUS).toBe(18);
  });
});
