import { describe, expect, it } from 'vitest';

import { facingRotationY, moveCharacter } from './movement';

describe('moveCharacter', () => {
  it('forward = 1 のとき -Z方向へ移動する (カメラは+Z側から原点を見ているため)', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: 1, right: 0 },
      speed: 4,
      delta: 1,
    });

    expect(next.z).toBeLessThan(0);
    expect(next.x).toBeCloseTo(0);
  });

  it('forward = -1 のとき +Z方向へ移動する', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: -1, right: 0 },
      speed: 4,
      delta: 1,
    });

    expect(next.z).toBeGreaterThan(0);
  });

  it('right = 1 のとき +X方向へ移動する', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: 0, right: 1 },
      speed: 4,
      delta: 1,
    });

    expect(next.x).toBeGreaterThan(0);
    expect(next.z).toBeCloseTo(0);
  });

  it('right = -1 のとき -X方向へ移動する', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: 0, right: -1 },
      speed: 4,
      delta: 1,
    });

    expect(next.x).toBeLessThan(0);
  });

  it('斜め入力は normalize され、速度が√2倍にならない', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: 1, right: 1 },
      speed: 4,
      delta: 1,
    });

    const distance = Math.hypot(next.x - 0, next.z - 0);
    expect(distance).toBeCloseTo(4);
  });

  it('入力なしなら位置が変化しない', () => {
    const position = { x: 1.5, z: -2.5 };
    const next = moveCharacter({
      position,
      input: { forward: 0, right: 0 },
      speed: 4,
      delta: 0.5,
    });

    expect(next).toEqual(position);
  });

  it('delta = 0.5, speed = 4 なら2 units移動する', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: 1, right: 0 },
      speed: 4,
      delta: 0.5,
    });

    expect(Math.abs(next.z)).toBeCloseTo(2);
  });
});

describe('facingRotationY', () => {
  it('入力なしなら null を返し、現在の向きを維持できるようにする', () => {
    expect(facingRotationY({ forward: 0, right: 0 })).toBeNull();
  });

  it('forward = 1 (前進) のとき rotationY = 0 (glTF既定の正面 -Z) を向く', () => {
    expect(facingRotationY({ forward: 1, right: 0 })).toBeCloseTo(0);
  });

  it('forward = -1 (後退) のとき背面 (±π) を向く', () => {
    const angle = facingRotationY({ forward: -1, right: 0 });
    expect(Math.abs(angle ?? 0)).toBeCloseTo(Math.PI);
  });

  it('right = 1 のとき -90度 (-π/2) を向く', () => {
    expect(facingRotationY({ forward: 0, right: 1 })).toBeCloseTo(-Math.PI / 2);
  });
});
