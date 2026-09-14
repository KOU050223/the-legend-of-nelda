import { describe, expect, it } from 'vitest';

import { ringLayout } from './stage-layout';

describe('ringLayout', () => {
  it('同じ引数なら常に同じ配置を返す (Math.randomを使わない決定論的な配置)', () => {
    const options = { count: 10, innerRadius: 5, outerRadius: 20, seed: 42 };

    expect(ringLayout(options)).toEqual(ringLayout(options));
  });

  it('指定した count 件数の配置を返す', () => {
    const placements = ringLayout({ count: 15, innerRadius: 1, outerRadius: 10 });

    expect(placements).toHaveLength(15);
  });

  it('全ての配置が innerRadius〜outerRadius の範囲内に収まる', () => {
    const innerRadius = 8;
    const outerRadius = 20;
    const placements = ringLayout({ count: 50, innerRadius, outerRadius, seed: 5 });

    for (const { x, z } of placements) {
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
});
