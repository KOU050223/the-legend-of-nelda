import { describe, expect, it } from 'vitest';
import { Group } from 'three';

import type { PlayerSnapshot } from '@/game/player/player-state';

import { dampCharacterRoot, dampPlanarPosition, syncCharacterRoot } from './character-root';

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'odoruno',
    characterId: 'ODORUNO',
    status: 'ACTIVE',
    hp: 100,
    hpMax: 100,
    position: { x: 1, z: 2 },
    rotationY: 0.5,
    swing: null,
    invulnerableUntil: null,
    dodgeReadyAt: 0,
    sleepAt: null,
    reviveInputs: 0,
    lastReviveAt: null,
    moveInput: { forward: 0, right: 0 },
    takenAt: 0,
    ...overrides,
  };
}

// テスト用の既定値。snapDistance は通常テストで踏まないよう大きめにしておく。
const LAMBDA = 20;
const SNAP_DISTANCE = 100;

describe('syncCharacterRoot', () => {
  it('同じActor Rootへプレイヤーの位置と向きを反映する', () => {
    const root = new Group();

    syncCharacterRoot(root, snapshot({ position: { x: 7, z: -3 }, rotationY: 1.25 }));

    expect(root.position.toArray()).toEqual([7, 0, -3]);
    expect(root.rotation.toArray().slice(0, 3)).toEqual([0, 1.25, 0]);
  });
});

describe('dampCharacterRoot', () => {
  it('目標へ瞬時には飛ばず、MathUtils.dampと同じ値まで経過時間なりに近づく', () => {
    const root = new Group();
    root.position.set(0, 0, 0);

    dampCharacterRoot(root, snapshot({ position: { x: 10, z: 0 }, rotationY: 0 }), {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: SNAP_DISTANCE,
    });

    // MathUtils.damp(0, 10, 20, 1/60) = 10 * (1 - e^(-20/60))
    const expected = 10 * (1 - Math.exp(-LAMBDA / 60));
    expect(root.position.x).toBeCloseTo(expected, 5);
    expect(root.position.x).toBeGreaterThan(0);
    expect(root.position.x).toBeLessThan(10);
  });

  it('同じ合計経過時間なら、フレーム分割数によらずほぼ同じ位置に着く(フレームレート非依存)', () => {
    const target = snapshot({ position: { x: 10, z: -6 }, rotationY: 0 });

    const oneBigStep = new Group();
    dampCharacterRoot(oneBigStep, target, {
      lambda: LAMBDA,
      deltaSeconds: 1 / 30,
      snapDistance: SNAP_DISTANCE,
    });

    const twoSmallSteps = new Group();
    dampCharacterRoot(twoSmallSteps, target, {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: SNAP_DISTANCE,
    });
    dampCharacterRoot(twoSmallSteps, target, {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: SNAP_DISTANCE,
    });

    // 60fpsで2フレーム進めても30fpsで1フレーム進めても、合計経過時間が
    // 同じなら結果はほぼ同じになるはず。`lerp(x, target, lambda * dt)` の
    // ようなフレームレート依存の実装だとここがずれる。
    expect(twoSmallSteps.position.x).toBeCloseTo(oneBigStep.position.x, 5);
    expect(twoSmallSteps.position.z).toBeCloseTo(oneBigStep.position.z, 5);
  });

  it('時間をかけると目標の位置・向きへ収束する', () => {
    const root = new Group();
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);

    dampCharacterRoot(root, snapshot({ position: { x: 10, z: -4 }, rotationY: 1.2 }), {
      lambda: LAMBDA,
      deltaSeconds: 5,
      snapDistance: SNAP_DISTANCE,
    });

    expect(root.position.x).toBeCloseTo(10, 1);
    expect(root.position.z).toBeCloseTo(-4, 1);
    expect(root.rotation.y).toBeCloseTo(1.2, 1);
  });

  it('±πをまたぐ向きでも最短方向(正回転)へ回る', () => {
    const root = new Group();
    root.rotation.set(0, Math.PI - 0.1, 0);

    dampCharacterRoot(root, snapshot({ position: { x: 0, z: 0 }, rotationY: -(Math.PI - 0.1) }), {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: SNAP_DISTANCE,
    });

    // 最短経路は+0.2ラジアン側。遠回り(-6.08ラジアン側)なら減る方向に動くはず。
    expect(root.rotation.y).toBeGreaterThan(Math.PI - 0.1);
  });

  it('±πをまたぐ向きでも最短方向(負回転)へ回る', () => {
    const root = new Group();
    root.rotation.set(0, -(Math.PI - 0.1), 0);

    dampCharacterRoot(root, snapshot({ position: { x: 0, z: 0 }, rotationY: Math.PI - 0.1 }), {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: SNAP_DISTANCE,
    });

    // 逆方向でも同じく最短(-0.2ラジアン側)へ回るはず。
    expect(root.rotation.y).toBeLessThan(-(Math.PI - 0.1));
  });

  it('y座標は常に0に保つ', () => {
    const root = new Group();
    root.position.set(0, 3, 0);

    dampCharacterRoot(root, snapshot({ position: { x: 1, z: 1 }, rotationY: 0 }), {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: SNAP_DISTANCE,
    });

    expect(root.position.y).toBe(0);
  });

  it('目標との距離がsnapDistanceを超えたら減衰させず即座に一致させる', () => {
    const root = new Group();
    root.position.set(0, 0, 0);

    dampCharacterRoot(root, snapshot({ position: { x: 100, z: 0 }, rotationY: 0 }), {
      lambda: LAMBDA,
      deltaSeconds: 1 / 60,
      snapDistance: 5,
    });

    // 新規マウント直後(原点始まり)や回避・突進のような大移動は、
    // ゆっくり滑らせず即座に反映する。
    expect(root.position.x).toBe(100);
  });
});

describe('dampPlanarPosition', () => {
  it('ボスのようなrotationを持たない対象でも位置だけ減衰できる', () => {
    const root = new Group();

    dampPlanarPosition(
      root,
      { x: 10, z: 0 },
      {
        lambda: LAMBDA,
        deltaSeconds: 1 / 60,
        snapDistance: SNAP_DISTANCE,
      },
    );

    expect(root.position.x).toBeGreaterThan(0);
    expect(root.position.x).toBeLessThan(10);
  });

  it('snapDistanceを超えたら即座に一致させる', () => {
    const root = new Group();

    dampPlanarPosition(
      root,
      { x: 10, z: 0 },
      { lambda: LAMBDA, deltaSeconds: 1 / 60, snapDistance: 5 },
    );

    expect(root.position.x).toBe(10);
  });
});
