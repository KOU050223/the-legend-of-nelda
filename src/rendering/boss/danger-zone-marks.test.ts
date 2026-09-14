import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';

import { isInsideDangerZone, type DangerZone } from '@/game/boss/attacks/danger-zone';

import { lineMarkRotation } from './danger-zone-geometry';

/**
 * 危険範囲の**描画**と**当たり判定**が同じ方向を向いていることを確かめる。
 *
 * 「危険範囲が視覚的に読める」(Issue #58) は、見えている範囲と当たる範囲が
 * 一致して初めて成立する。ここがずれると、避けたつもりの場所で被弾する。
 *
 * 0° / 90° / 180° は符号を間違えても偶然一致してしまうので、**45°のような
 * 斜めを必ず含める**。実際、z の符号が反転していたバグは斜めでしか出なかった。
 */

/** 描画される矩形の長辺が、ワールド座標でどちらを向くか。 */
function drawnDirection(rotationY: number): Vector3 {
  // planeGeometry は XY 平面にあり、length に当たる長辺はローカル +Y。
  return new Vector3(0, 1, 0).applyEuler(new Euler(...lineMarkRotation(rotationY), 'XYZ'));
}

/** 当たり判定が前方とみなす向き (danger-zone.ts と同じ式)。 */
function judgedDirection(rotationY: number): Vector3 {
  return new Vector3(-Math.sin(rotationY), 0, -Math.cos(rotationY));
}

const ANGLES_DEG = [0, 30, 45, 90, 135, 180, 225, -45];

describe('突進の危険範囲は描画と判定が一致する', () => {
  it.each(ANGLES_DEG)('%s度で同じ方向を向く', (deg) => {
    const rotationY = (deg * Math.PI) / 180;

    // 内積が1なら完全に同じ向き。
    expect(drawnDirection(rotationY).dot(judgedDirection(rotationY))).toBeCloseTo(1);
  });

  it.each(ANGLES_DEG)('%s度で、描かれた矩形の中心が判定の内側にある', (deg) => {
    const rotationY = (deg * Math.PI) / 180;
    const length = 30;
    const zone: DangerZone = {
      id: 'TEST:0',
      origin: { x: 0, z: 0 },
      shape: { kind: 'LINE', length, halfWidth: 2.5 },
      rotationY,
    };

    // 描画される矩形の中心 (始点から長さの半分だけ進んだ点)。
    const center = drawnDirection(rotationY).multiplyScalar(length / 2);

    expect(isInsideDangerZone(zone, { x: center.x, z: center.z })).toBe(true);
  });
});
