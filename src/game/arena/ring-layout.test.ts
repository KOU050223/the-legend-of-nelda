import { describe, expect, it } from 'vitest';

import { ringLayout } from './ring-layout';

describe('ringLayout', () => {
  it('同じ引数なら常に同じ配置を返す (Math.randomを使わない決定論的な配置)', () => {
    const options = { count: 10, innerRadius: 5, outerRadius: 20, seed: 42 };

    expect(ringLayout(options)).toEqual(ringLayout(options));
  });

  it('指定した count 件数の配置を返す', () => {
    const points = ringLayout({ count: 15, innerRadius: 1, outerRadius: 10 });

    expect(points).toHaveLength(15);
  });

  it('全ての配置が innerRadius〜outerRadius の範囲内に収まる', () => {
    const innerRadius = 8;
    const outerRadius = 20;
    const points = ringLayout({ count: 50, innerRadius, outerRadius, seed: 5 });

    for (const { x, z } of points) {
      const radius = Math.hypot(x, z);
      expect(radius).toBeGreaterThanOrEqual(innerRadius - 0.001);
      expect(radius).toBeLessThanOrEqual(outerRadius + 0.001);
    }
  });

  it('seed が異なれば配置も変わる', () => {
    const a = ringLayout({ count: 10, innerRadius: 5, outerRadius: 20, seed: 1 });
    const b = ringLayout({ count: 10, innerRadius: 5, outerRadius: 20, seed: 2 });

    expect(a).not.toEqual(b);
  });

  it('angle は座標と一致する (呼び出し側が atan2 で再計算しなくてよい)', () => {
    const points = ringLayout({ count: 8, innerRadius: 4, outerRadius: 9, seed: 3 });

    for (const { x, z, angle } of points) {
      const radius = Math.hypot(x, z);
      expect(Math.cos(angle) * radius).toBeCloseTo(x);
      expect(Math.sin(angle) * radius).toBeCloseTo(z);
    }
  });

  it('angleJitter: 0 なら角度が完全に等間隔になる (ゲーム用アンカー向け)', () => {
    const points = ringLayout({
      count: 3,
      innerRadius: 10,
      outerRadius: 10,
      seed: 21,
      angleJitter: 0,
    });

    expect(points.map((point) => point.angle)).toEqual([0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]);
  });

  it('angleJitter の既定値は 0 ではない (木・岩・草は今までどおりばらける)', () => {
    const jittered = ringLayout({ count: 6, innerRadius: 10, outerRadius: 10, seed: 11 });
    const even = ringLayout({
      count: 6,
      innerRadius: 10,
      outerRadius: 10,
      seed: 11,
      angleJitter: 0,
    });

    expect(jittered).not.toEqual(even);
  });

  it('angleOffset ぶん角度がずれ、2つのリングを互い違いに並べられる', () => {
    const shared = { count: 3, innerRadius: 10, outerRadius: 10, angleJitter: 0 };
    const base = ringLayout(shared);
    const offset = ringLayout({ ...shared, angleOffset: Math.PI / 3 });

    for (const [index, point] of offset.entries()) {
      expect(point.angle - (base[index]?.angle ?? 0)).toBeCloseTo(Math.PI / 3);
    }
  });

  it('angleOffset の既定は 0 で、指定しなければ角度が変わらない', () => {
    const options = { count: 7, innerRadius: 3, outerRadius: 12, seed: 9 };

    expect(ringLayout(options)).toEqual(ringLayout({ ...options, angleOffset: 0 }));
  });
});
