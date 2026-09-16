import { describe, expect, it } from 'vitest';

import { createHandJoystick } from './hand-joystick';
import type { HandObservation } from './types';

const neutral = { x: 0.5, y: 0.5 };

function hand(x: number, y: number): NonNullable<HandObservation['left']> {
  return { x, y, velocityX: 0, velocityY: 0 };
}

describe('createHandJoystick', () => {
  it.each([
    { direction: '右', position: hand(0.7, 0.5), expected: { forward: 0, right: 0.5 } },
    { direction: '左', position: hand(0.3, 0.5), expected: { forward: 0, right: -0.5 } },
    { direction: '上', position: hand(0.5, 0.3), expected: { forward: 0.5, right: 0 } },
    { direction: '下', position: hand(0.5, 0.7), expected: { forward: -0.5, right: 0 } },
  ])('$directionへ動かすと対応する移動方向になる', ({ position, expected }) => {
    const joystick = createHandJoystick({
      deadZoneEnter: 0.05,
      deadZoneRelease: 0.025,
      maxDistance: 0.4,
      smoothing: 1,
    });

    const result = joystick.update(position, neutral, 0);

    expect(result.forward).toBeCloseTo(expected.forward);
    expect(result.right).toBeCloseTo(expected.right);
  });

  it('最大距離を超えた斜め入力でもforwardとrightの比率を保ったままClampする', () => {
    const joystick = createHandJoystick({
      deadZoneEnter: 0.05,
      deadZoneRelease: 0.025,
      maxDistance: 0.2,
      smoothing: 1,
    });

    const result = joystick.update(hand(0.8, 0.7), neutral, 0);

    expect(Math.hypot(result.forward, result.right)).toBeCloseTo(1);
    expect(result.forward).toBeCloseTo(-0.5547, 4);
    expect(result.right).toBeCloseTo(0.8321, 4);
    expect(result.right / Math.abs(result.forward)).toBeCloseTo(1.5);
  });

  it('Dead Zoneの境界ではEnterを超えるまでONにならず、Releaseを下回るまでONを保持する', () => {
    const joystick = createHandJoystick({
      deadZoneEnter: 0.1,
      deadZoneRelease: 0.05,
      maxDistance: 0.5,
      smoothing: 1,
    });

    expect(joystick.update(hand(0.6, 0.5), neutral, 0)).toEqual({ forward: 0, right: 0 });

    const entered = joystick.update(hand(0.61, 0.5), neutral, 16);
    expect(entered.right).toBeCloseTo(0.22);

    const heldAtRelease = joystick.update(hand(0.55, 0.5), neutral, 32);
    expect(heldAtRelease.right).toBeCloseTo(0.1);

    expect(joystick.update(hand(0.54, 0.5), neutral, 48)).toEqual({
      forward: 0,
      right: 0,
    });
  });

  it('生の手位置へEMAを適用してフレーム間の出力変化をなだらかにする', () => {
    const joystick = createHandJoystick({
      deadZoneEnter: 0.05,
      deadZoneRelease: 0.025,
      maxDistance: 0.5,
      smoothing: 0.5,
    });

    expect(joystick.update(hand(0.5, 0.5), neutral, 0)).toEqual({ forward: 0, right: 0 });

    const first = joystick.update(hand(0.9, 0.5), neutral, 16);
    const second = joystick.update(hand(0.9, 0.5), neutral, 32);

    expect(first.right).toBeCloseTo(0.4);
    expect(second.right).toBeCloseTo(0.6);
  });

  it('手を見失うと即時に状態をリセットし、再検出後は古いEMAを引き継がない', () => {
    const joystick = createHandJoystick({
      deadZoneEnter: 0.05,
      deadZoneRelease: 0.025,
      maxDistance: 0.5,
      smoothing: 0.5,
    });

    expect(joystick.update(hand(0.8, 0.5), neutral, 0).right).toBeCloseTo(0.6);
    expect(joystick.update(undefined, neutral, 16)).toEqual({ forward: 0, right: 0 });
    expect(joystick.update(hand(0.5, 0.5), neutral, 32)).toEqual({
      forward: 0,
      right: 0,
    });

    expect(joystick.update(hand(0.7, 0.5), neutral, 48).right).toBeCloseTo(0.2);
  });

  it('Neutral未確定中も状態をリセットして出力せず、Neutral再開後に復帰する', () => {
    const joystick = createHandJoystick({
      deadZoneEnter: 0.05,
      deadZoneRelease: 0.025,
      maxDistance: 0.5,
      smoothing: 0.5,
    });

    expect(joystick.update(hand(0.8, 0.5), neutral, 0).right).toBeCloseTo(0.6);
    expect(joystick.update(hand(0.5, 0.5), undefined, 16)).toEqual({
      forward: 0,
      right: 0,
    });
    expect(joystick.update(hand(0.5, 0.5), neutral, 32)).toEqual({
      forward: 0,
      right: 0,
    });
  });
});
