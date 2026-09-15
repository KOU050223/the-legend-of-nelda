import { describe, expect, it } from 'vitest';

import { toCameraRelativeMovement } from './camera-relative-movement';

describe('toCameraRelativeMovement', () => {
  it('カメラが -Z を向くときは入力をそのままワールド方向へ送る', () => {
    const movement = toCameraRelativeMovement({ forward: 1, right: -1 }, 0);

    expect(movement).toEqual({ forward: 1, right: -1 });
  });

  it('カメラが +X を向くときは W で画面奥の +X 方向へ進む', () => {
    const movement = toCameraRelativeMovement({ forward: 1, right: 0 }, -Math.PI / 2);

    expect(movement.forward).toBeCloseTo(0);
    expect(movement.right).toBeCloseTo(1);
  });

  it('カメラが +X を向くときは D で画面右の +Z 方向へ進む', () => {
    const movement = toCameraRelativeMovement({ forward: 0, right: 1 }, -Math.PI / 2);

    expect(movement.forward).toBeCloseTo(-1);
    expect(movement.right).toBeCloseTo(0);
  });
});
