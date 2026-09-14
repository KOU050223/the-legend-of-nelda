import { describe, expect, it } from 'vitest';

import { SAFE_ZONE_ANCHORS, SAFE_ZONE_RADIUS } from '../../arena/arena';
import { ringLayout } from '../../arena/ring-layout';
import {
  COMPRESSION_FIELD_ANGLE_JITTER,
  COMPRESSION_FIELD_RING,
  COMPRESSION_FIELD_ZONE_COUNT,
  DEFAULT_HORI_ATTACKS,
} from '../../config/phase2-boss-balance';
import type { PlanarPosition } from '../../movement/types';

import { aimAttack, SAFE_ZONE_CLEARANCE } from './hori-attacks';

const SPEC = DEFAULT_HORI_ATTACKS.COMPRESSION_FIELD;
const DANGER_RADIUS = SPEC.shape.kind === 'CIRCLE' ? SPEC.shape.radius : 0;

/** 安全地帯の円と危険円が交差しないための中心間距離。これが要求条件。 */
const REQUIRED_DISTANCE = DANGER_RADIUS + SAFE_ZONE_RADIUS;
/** 実装が実際に確保する距離。要求条件に余白を足したもの。 */
const PLACED_DISTANCE = REQUIRED_DISTANCE + SAFE_ZONE_CLEARANCE;

/** 1つの seed だけでは偶然通ることがあるので、まとめて確かめる。 */
const SEEDS = Array.from({ length: 30 }, (_, index) => index + 1);

function distance(a: PlanarPosition, b: PlanarPosition): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function radiusOf(point: PlanarPosition): number {
  return Math.hypot(point.x, point.z);
}

/** 実際に展開される危険区画の中心。 */
function zonesFor(seed: number): readonly PlanarPosition[] {
  return aimAttack('COMPRESSION_FIELD', { bossPosition: { x: 0, z: 0 }, targets: [], seed }).points;
}

/** 補正前の候補。実装と同じ ringLayout の呼び出し。 */
function candidatesFor(seed: number): readonly PlanarPosition[] {
  return ringLayout({
    count: COMPRESSION_FIELD_ZONE_COUNT,
    innerRadius: COMPRESSION_FIELD_RING.innerRadius,
    outerRadius: COMPRESSION_FIELD_RING.outerRadius,
    seed,
    angleJitter: COMPRESSION_FIELD_ANGLE_JITTER,
  });
}

describe('睡眠時間圧縮フィールドの危険区画', () => {
  it('どの seed でも安全地帯の円と交差しない', () => {
    // docs/phase2-gameplay-spec.md §9.3 の対処は「安全地帯へ移動する」。
    // 安全地帯が危険区画に食われると、この技に対処手段が無くなる。
    for (const seed of SEEDS) {
      for (const zone of zonesFor(seed)) {
        for (const anchor of SAFE_ZONE_ANCHORS) {
          expect(distance(zone, anchor)).toBeGreaterThanOrEqual(REQUIRED_DISTANCE - 1e-9);
        }
      }
    }
  });

  it('安全地帯との間に余白ぶんの離隔がある', () => {
    // ちょうど接する配置だと、安全地帯の縁に立ったプレイヤーが
    // isInsideDangerZone の「境界は内側」判定で被弾する。
    for (const seed of SEEDS) {
      for (const zone of zonesFor(seed)) {
        for (const anchor of SAFE_ZONE_ANCHORS) {
          expect(distance(zone, anchor)).toBeGreaterThanOrEqual(PLACED_DISTANCE - 1e-9);
        }
      }
    }
  });

  it('どの seed でも危険区画の数が変わらない', () => {
    // 安全地帯に重なった候補を捨てて減らす実装にはしない。
    for (const seed of SEEDS) {
      expect(zonesFor(seed)).toHaveLength(COMPRESSION_FIELD_ZONE_COUNT);
    }
  });

  it('同じ seed なら同じ座標になる', () => {
    // スナップショットから復元しても同じ配置が出る条件 (Issue #58)。
    for (const seed of SEEDS) {
      expect(zonesFor(seed)).toEqual(zonesFor(seed));
    }
  });

  it('seed が違えば配置も変わる', () => {
    // 毎回同じ場所が安全になると、位置を覚えるだけの技になる。
    expect(zonesFor(1)).not.toEqual(zonesFor(2));
  });

  it('危険円の中心が COMPRESSION_FIELD_RING の外へ出ない', () => {
    for (const seed of SEEDS) {
      for (const zone of zonesFor(seed)) {
        expect(radiusOf(zone)).toBeGreaterThanOrEqual(COMPRESSION_FIELD_RING.innerRadius - 1e-9);
        expect(radiusOf(zone)).toBeLessThanOrEqual(COMPRESSION_FIELD_RING.outerRadius + 1e-9);
      }
    }
  });

  it('安全地帯に当たらない候補はそのまま使う', () => {
    // 半径分布を保つため、動かす必要のない候補は動かさない。
    let kept = 0;
    for (const seed of SEEDS) {
      const before = candidatesFor(seed);
      const after = zonesFor(seed);
      before.forEach((candidate, index) => {
        const clear = SAFE_ZONE_ANCHORS.every(
          (anchor) => distance(candidate, anchor) >= PLACED_DISTANCE,
        );
        if (!clear) return;
        kept += 1;
        expect(after[index]?.x).toBeCloseTo(candidate.x);
        expect(after[index]?.z).toBeCloseTo(candidate.z);
      });
    }
    // 上の検査が1件も回っていない (=空振り) ことがないよう確かめる。
    expect(kept).toBeGreaterThan(0);
  });

  it('補正で半径が元の候補より小さくならない', () => {
    // 内側へ逃がすと COMPRESSION_FIELD_RING の内径の意味が壊れる。
    for (const seed of SEEDS) {
      const before = candidatesFor(seed);
      const after = zonesFor(seed);
      before.forEach((candidate, index) => {
        const moved = after[index];
        expect(moved).toBeDefined();
        if (moved === undefined) return;
        expect(radiusOf(moved)).toBeGreaterThanOrEqual(radiusOf(candidate) - 1e-9);
      });
    }
  });
});
