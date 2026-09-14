import { describe, expect, it } from 'vitest';

import { ringLayout } from '@/game/arena/ring-layout';

import { propRingLayout } from './stage-layout';

describe('propRingLayout', () => {
  it('同じ引数なら常に同じ配置を返す (再レンダーで木や岩が動かない)', () => {
    const options = { count: 12, innerRadius: 5, outerRadius: 20, seed: 42 };

    expect(propRingLayout(options)).toEqual(propRingLayout(options));
  });

  it('座標は ringLayout の結果をそのまま使う (配置の決定はGame層に1つだけ)', () => {
    const options = { count: 9, innerRadius: 6, outerRadius: 14, seed: 7 };

    const placements = propRingLayout(options);
    const points = ringLayout(options);

    expect(placements.map(({ x, z }) => ({ x, z }))).toEqual(points.map(({ x, z }) => ({ x, z })));
  });

  it('向きと大きさは props ごとにばらつく (同じ形の繰り返しに見せない)', () => {
    const placements = propRingLayout({ count: 20, innerRadius: 5, outerRadius: 20, seed: 3 });

    expect(new Set(placements.map((placement) => placement.rotationY)).size).toBeGreaterThan(1);
    expect(new Set(placements.map((placement) => placement.scale)).size).toBeGreaterThan(1);
  });

  it('大きさは基準サイズの 0.8〜1.3 倍に収まる', () => {
    const placements = propRingLayout({ count: 50, innerRadius: 5, outerRadius: 20, seed: 5 });

    for (const { scale } of placements) {
      expect(scale).toBeGreaterThanOrEqual(0.8);
      expect(scale).toBeLessThanOrEqual(1.3);
    }
  });
});
