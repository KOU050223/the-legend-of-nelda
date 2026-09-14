import { describe, expect, it } from 'vitest';

import { isInsideDangerZone, type DangerZone } from './danger-zone';

describe('絶対起床アラームの危険範囲 (全方位リング)', () => {
  const zone: DangerZone = {
    origin: { x: 0, z: 0 },
    shape: { kind: 'RING', innerRadius: 3, outerRadius: 18 },
    rotationY: 0,
  };

  it('ボスの足元は安全', () => {
    expect(isInsideDangerZone(zone, { x: 0, z: 0 })).toBe(false);
    expect(isInsideDangerZone(zone, { x: 2.9, z: 0 })).toBe(false);
  });

  it('リングの帯の中は被弾する', () => {
    expect(isInsideDangerZone(zone, { x: 10, z: 0 })).toBe(true);
    expect(isInsideDangerZone(zone, { x: 0, z: -10 })).toBe(true);
  });

  it('十分に距離を取れば安全', () => {
    expect(isInsideDangerZone(zone, { x: 18.1, z: 0 })).toBe(false);
    expect(isInsideDangerZone(zone, { x: 30, z: 30 })).toBe(false);
  });
});

describe('早朝ルーティン突進の危険範囲 (直線)', () => {
  // rotationY = 0 は -Z を向く (facingRotationY と同じ規約)。
  const zone: DangerZone = {
    origin: { x: 0, z: 0 },
    shape: { kind: 'LINE', length: 30, halfWidth: 2.5 },
    rotationY: 0,
  };

  it('突進の軌道上に居ると被弾する', () => {
    expect(isInsideDangerZone(zone, { x: 0, z: -15 })).toBe(true);
    expect(isInsideDangerZone(zone, { x: 2, z: -29 })).toBe(true);
  });

  it('横へ回避すれば当たらない', () => {
    expect(isInsideDangerZone(zone, { x: 3, z: -15 })).toBe(false);
    expect(isInsideDangerZone(zone, { x: -4, z: -15 })).toBe(false);
  });

  it('突進の背後と射程の先は当たらない', () => {
    expect(isInsideDangerZone(zone, { x: 0, z: 5 })).toBe(false);
    expect(isInsideDangerZone(zone, { x: 0, z: -31 })).toBe(false);
  });

  it('向きを変えると危険な方向も変わる', () => {
    // 90度回すと -X 方向へ伸びる。
    const turned: DangerZone = { ...zone, rotationY: Math.PI / 2 };
    expect(isInsideDangerZone(turned, { x: -15, z: 0 })).toBe(true);
    expect(isInsideDangerZone(turned, { x: 0, z: -15 })).toBe(false);
  });
});

describe('ブルーライト / 圧縮フィールドの危険範囲 (円)', () => {
  const zone: DangerZone = {
    origin: { x: 10, z: -5 },
    shape: { kind: 'CIRCLE', radius: 6 },
    rotationY: 0,
  };

  it('円の内側に居ると被弾する', () => {
    expect(isInsideDangerZone(zone, { x: 10, z: -5 })).toBe(true);
    expect(isInsideDangerZone(zone, { x: 14, z: -5 })).toBe(true);
  });

  it('安全地帯へ抜ければ当たらない', () => {
    expect(isInsideDangerZone(zone, { x: 17, z: -5 })).toBe(false);
    expect(isInsideDangerZone(zone, { x: 0, z: 0 })).toBe(false);
  });
});
