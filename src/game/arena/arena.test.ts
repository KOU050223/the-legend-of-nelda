import { describe, expect, it } from 'vitest';

import { facingRotationY } from '@/game/movement/movement';

import {
  ALTAR_ANCHOR,
  ARENA_BOUNDS,
  ARENA_RADIUS,
  BOSS_ANCHOR,
  DEVICE_ANCHORS,
  SAFE_ZONE_ANCHORS,
  SAFE_ZONE_RADIUS,
  SPAWN_POINTS,
  type ArenaAnchor,
} from './arena';

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function radiusOf(point: { x: number; z: number }): number {
  return Math.hypot(point.x, point.z);
}

/** 原点から見た角度を 0〜359 度に丸める。 */
function degreesOf(point: { x: number; z: number }): number {
  const degrees = Math.round((Math.atan2(point.z, point.x) * 180) / Math.PI);
  return (degrees + 360) % 360;
}

/** 2点を原点から見たときの角度差 (0〜180度)。一周をまたいでも正しく測る。 */
function angleGapDegrees(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const gap = Math.abs(degreesOf(a) - degreesOf(b)) % 360;
  return gap > 180 ? 360 - gap : gap;
}

const ALL_ANCHORS: readonly ArenaAnchor[] = [...DEVICE_ANCHORS, ...SAFE_ZONE_ANCHORS, ALTAR_ANCHOR];

describe('アリーナの境界', () => {
  it('移動範囲の半径がアリーナの半径と一致する', () => {
    expect(ARENA_BOUNDS.radius).toBe(ARENA_RADIUS);
  });

  it('スポーン地点・装置・安全地帯・祭壇がすべて移動できる範囲の中にある', () => {
    for (const point of [...SPAWN_POINTS, ...ALL_ANCHORS, BOSS_ANCHOR]) {
      expect(radiusOf(point)).toBeLessThan(ARENA_RADIUS);
    }
  });

  it('安全地帯はその広さごと移動できる範囲へ収まる (端が壁の外へはみ出さない)', () => {
    for (const anchor of SAFE_ZONE_ANCHORS) {
      expect(radiusOf(anchor) + SAFE_ZONE_RADIUS).toBeLessThan(ARENA_RADIUS);
    }
  });
});

describe('3人のスポーン地点', () => {
  it('3人分ある', () => {
    expect(SPAWN_POINTS).toHaveLength(3);
  });

  it('互いに重ならない', () => {
    for (const [index, spawn] of SPAWN_POINTS.entries()) {
      for (const other of SPAWN_POINTS.slice(index + 1)) {
        expect(distance(spawn, other)).toBeGreaterThan(1);
      }
    }
  });

  it('全員がボスと同じ側ではなく手前に立ち、初期回転なしでボスを向ける', () => {
    // 回転を持たせずに済ませているのは全員が +Z 側にいるからで、
    // 片方でも反対側へ移すと「rotationY = 0 が -Z 向き」の前提が崩れる。
    for (const spawn of SPAWN_POINTS) {
      expect(spawn.z).toBeGreaterThan(BOSS_ANCHOR.z);
    }
  });

  it('ボスから離れており、開幕から密着していない', () => {
    for (const spawn of SPAWN_POINTS) {
      expect(distance(spawn, BOSS_ANCHOR)).toBeGreaterThan(10);
    }
  });
});

describe('装置・安全地帯・祭壇のアンカー', () => {
  it('装置が3基あり、結界の3人分担 (見る・運ぶ・起動する) を割り当てられる', () => {
    expect(DEVICE_ANCHORS).toHaveLength(3);
  });

  it('安全地帯が3箇所あり、装置と互い違いに並ぶ (片側だけが混み合わない)', () => {
    expect(SAFE_ZONE_ANCHORS).toHaveLength(3);

    for (const zone of SAFE_ZONE_ANCHORS) {
      for (const device of DEVICE_ANCHORS) {
        expect(angleGapDegrees(zone, device)).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('安全地帯どうしが重ならない', () => {
    for (const [index, zone] of SAFE_ZONE_ANCHORS.entries()) {
      for (const other of SAFE_ZONE_ANCHORS.slice(index + 1)) {
        expect(distance(zone, other)).toBeGreaterThan(SAFE_ZONE_RADIUS * 2);
      }
    }
  });

  it('装置が安全地帯の中に埋まらない', () => {
    for (const device of DEVICE_ANCHORS) {
      for (const zone of SAFE_ZONE_ANCHORS) {
        expect(distance(device, zone)).toBeGreaterThan(SAFE_ZONE_RADIUS);
      }
    }
  });

  it('祭壇はボスを挟んでスポーン地点の反対側にある', () => {
    expect(ALTAR_ANCHOR.z).toBeLessThan(BOSS_ANCHOR.z);
  });

  it('どのアンカーもボスの足元に重ならない', () => {
    for (const anchor of ALL_ANCHORS) {
      expect(distance(anchor, BOSS_ANCHOR)).toBeGreaterThan(5);
    }
  });
});

describe('アンカーの向き', () => {
  it('アリーナ中心を向いている', () => {
    for (const anchor of ALL_ANCHORS) {
      // rotationY = 0 が -Z 向き。その正面ベクトルを rotationY ぶん回し、
      // 中心へのベクトルと同じ向きになるか確かめる。
      const facingX = -Math.sin(anchor.rotationY);
      const facingZ = -Math.cos(anchor.rotationY);
      const toCenter = Math.hypot(anchor.x, anchor.z);

      expect(facingX).toBeCloseTo(-anchor.x / toCenter);
      expect(facingZ).toBeCloseTo(-anchor.z / toCenter);
    }
  });

  it('移動の向き計算 (facingRotationY) と同じ規約になっている', () => {
    for (const anchor of ALL_ANCHORS) {
      const toCenter = Math.hypot(anchor.x, anchor.z);
      const fromMovement = facingRotationY({
        forward: anchor.z / toCenter,
        right: -anchor.x / toCenter,
      });

      expect(fromMovement).toBeCloseTo(anchor.rotationY);
    }
  });
});

describe('仕様どおりの座標', () => {
  // docs/phase2-boss-arena-spec.md の座標表と対応する。半径・角度が
  // 変わったら仕様表も直す。
  it('装置は半径17に 0度 / 120度 / 240度 で並ぶ', () => {
    expect(DEVICE_ANCHORS.map((anchor) => Math.round(radiusOf(anchor)))).toEqual([17, 17, 17]);
    expect(DEVICE_ANCHORS.map(degreesOf)).toEqual([0, 120, 240]);
  });

  it('安全地帯は半径11に 60度 / 180度 / 300度 で並ぶ', () => {
    expect(SAFE_ZONE_ANCHORS.map((anchor) => Math.round(radiusOf(anchor)))).toEqual([11, 11, 11]);
    expect(SAFE_ZONE_ANCHORS.map(degreesOf)).toEqual([60, 180, 300]);
  });

  it('祭壇は半径20の 270度 (スポーンの正面奥) にある', () => {
    expect(Math.round(radiusOf(ALTAR_ANCHOR))).toBe(20);
    expect(degreesOf(ALTAR_ANCHOR)).toBe(270);
  });
});
