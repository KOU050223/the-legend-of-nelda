import { describe, expect, it } from 'vitest';

import { clampToBounds, facingRotationY, moveCharacter } from './movement';

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

  it('入力なしのときも呼び出し元の position オブジェクトとは別の値を返す', () => {
    // 入力ありの経路は常に新しいオブジェクトを作るため、入力なしの経路だけ
    // 呼び出し元の position をそのまま返すと、呼び出し側がその後 position を
    // 書き換えたときに意図せず影響してしまう非対称さがある。
    const position = { x: 1.5, z: -2.5 };
    const next = moveCharacter({
      position,
      input: { forward: 0, right: 0 },
      speed: 4,
      delta: 0.5,
    });

    expect(next).not.toBe(position);
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

describe('moveCharacter の境界クランプ', () => {
  const bounds = { radius: 10 };

  it('bounds を渡さなければ従来どおり制限されない', () => {
    const next = moveCharacter({
      position: { x: 0, z: 0 },
      input: { forward: 1, right: 0 },
      speed: 100,
      delta: 1,
    });

    expect(Math.hypot(next.x, next.z)).toBeCloseTo(100);
  });

  it('外へ向かって歩き続けてもアリーナの外へ出られない', () => {
    // 制限なしなら 40 units 進む長さ。境界 (10) に達したうえで止まることを見る。
    let position = { x: 0, z: 0 };
    for (let frame = 0; frame < 600; frame += 1) {
      position = moveCharacter({
        position,
        input: { forward: 0, right: 1 },
        speed: 4,
        delta: 1 / 60,
        bounds,
      });
    }

    expect(Math.hypot(position.x, position.z)).toBeCloseTo(bounds.radius);
    expect(position.x).toBeCloseTo(bounds.radius);
  });

  it('壁へ斜めに押し当てると止まらず壁沿いに進む', () => {
    // 逃げ回る攻撃 (ブルーライト照射) で壁に張り付かないことを保証する。
    const onWall = { x: bounds.radius, z: 0 };
    const next = moveCharacter({
      position: onWall,
      input: { forward: 1, right: 1 },
      speed: 4,
      delta: 1 / 60,
      bounds,
    });

    expect(Math.hypot(next.x, next.z)).toBeCloseTo(bounds.radius);
    expect(next.z).toBeLessThan(onWall.z);
  });

  it('壁沿いに進んでも一周ぶんの向きは失わない (接線方向へ進み続けられる)', () => {
    let position = { x: bounds.radius, z: 0 };
    for (let frame = 0; frame < 60; frame += 1) {
      position = moveCharacter({
        position,
        input: { forward: 1, right: 1 },
        speed: 4,
        delta: 1 / 60,
        bounds,
      });
    }

    expect(Math.hypot(position.x, position.z)).toBeCloseTo(bounds.radius);
    expect(position.z).toBeLessThan(-1);
  });

  it('入力がなくても境界の外にある位置は引き戻される', () => {
    const next = moveCharacter({
      position: { x: 40, z: 0 },
      input: { forward: 0, right: 0 },
      speed: 4,
      delta: 1 / 60,
      bounds,
    });

    expect(next).toEqual({ x: bounds.radius, z: 0 });
  });

  it('境界の内側では位置を変えない', () => {
    const inside = { x: 1, z: -2 };
    const next = moveCharacter({
      position: inside,
      input: { forward: 0, right: 0 },
      speed: 4,
      delta: 1 / 60,
      bounds,
    });

    expect(next).toEqual(inside);
  });
});

describe('clampToBounds', () => {
  it('境界の外の位置は角度を保ったまま境界上へ丸める', () => {
    const clamped = clampToBounds({ x: 30, z: 40 }, { radius: 5 });

    expect(clamped).toEqual({ x: 3, z: 4 });
  });

  it('境界上の位置は動かさない', () => {
    expect(clampToBounds({ x: 0, z: 5 }, { radius: 5 })).toEqual({ x: 0, z: 5 });
  });

  it('原点でも 0除算にならない', () => {
    expect(clampToBounds({ x: 0, z: 0 }, { radius: 5 })).toEqual({ x: 0, z: 0 });
  });

  it('呼び出し元の position オブジェクトをそのまま返さない', () => {
    const position = { x: 1, z: 1 };

    expect(clampToBounds(position, { radius: 5 })).not.toBe(position);
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

  it('right = -1 のとき +90度 (π/2) を向く', () => {
    // right軸の符号を反転させ間違えると片側でしか気づけないため、
    // 正負両方を確認する。
    expect(facingRotationY({ forward: 0, right: -1 })).toBeCloseTo(Math.PI / 2);
  });
});
