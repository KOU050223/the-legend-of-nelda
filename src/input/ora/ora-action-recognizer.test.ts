import { describe, expect, it } from 'vitest';

import { createOraActionRecognizer } from './ora-action-recognizer';
import type { HandObservation } from './types';

type Hand = NonNullable<HandObservation['left']>;

function hand(x = 0.2, y = 0.2, isOpen = true): Hand {
  return { x, y, velocityX: 0, velocityY: 0, isOpen };
}

function update(
  recognizer: ReturnType<typeof createOraActionRecognizer>,
  now: number,
  left: Hand | undefined = hand(0.2),
  right: Hand | undefined = hand(0.8),
) {
  return recognizer.update(left, right, now);
}

describe('createOraActionRecognizer', () => {
  it('両手を開いて上側で十分に広げて700ms保つと発動する', () => {
    const recognizer = createOraActionRecognizer();

    const started = update(recognizer, 0);
    const beforeHold = update(recognizer, 699);
    const triggered = update(recognizer, 700);

    expect(started).toEqual({ progress: 0, isHolding: true, triggered: false });
    expect(beforeHold).toEqual({ progress: 699 / 700, isHolding: true, triggered: false });
    expect(triggered).toEqual({ progress: 1, isHolding: true, triggered: true });
  });

  it('Holdが700ms未満なら発動しない', () => {
    const recognizer = createOraActionRecognizer();

    update(recognizer, 0);
    const result = update(recognizer, 699);

    expect(result.triggered).toBe(false);
    expect(result.progress).toBeLessThan(1);
  });

  it('片手だけが開いていても発動しない', () => {
    const recognizer = createOraActionRecognizer();

    const result = update(recognizer, 700, hand(0.2, 0.2, false), hand(0.8, 0.2, true));

    expect(result).toEqual({ progress: 0, isHolding: false, triggered: false });
  });

  it.each([
    {
      condition: '左手が上側にない',
      left: hand(0.2, 0.46),
      right: hand(0.8, 0.2),
    },
    {
      condition: '右手が上側にない',
      left: hand(0.2, 0.2),
      right: hand(0.8, 0.46),
    },
    {
      condition: '両手の間隔が足りない',
      left: hand(0.2, 0.2),
      right: hand(0.54, 0.2),
    },
  ])('$condition では発動しない', ({ left, right }) => {
    const recognizer = createOraActionRecognizer();

    const result = update(recognizer, 700, left, right);

    expect(result).toEqual({ progress: 0, isHolding: false, triggered: false });
  });

  it('片手でも見失うとHoldがリセットされる', () => {
    const recognizer = createOraActionRecognizer();

    update(recognizer, 0);
    update(recognizer, 500);
    const lost = recognizer.update(undefined, hand(0.8), 600);
    const resumed = update(recognizer, 700);

    expect(lost).toEqual({ progress: 0, isHolding: false, triggered: false });
    expect(resumed).toEqual({ progress: 0, isHolding: true, triggered: false });
  });

  it('発動後にポーズを維持しても再トリガーしない', () => {
    const recognizer = createOraActionRecognizer();

    update(recognizer, 0);
    expect(update(recognizer, 700).triggered).toBe(true);

    const continued = update(recognizer, 1_700);

    expect(continued).toEqual({ progress: 1, isHolding: true, triggered: false });
  });

  it('ポーズを解除してから再度700ms保つと再トリガーできる', () => {
    const recognizer = createOraActionRecognizer();

    update(recognizer, 0);
    expect(update(recognizer, 700).triggered).toBe(true);
    expect(recognizer.update(undefined, hand(0.8), 701)).toEqual({
      progress: 0,
      isHolding: false,
      triggered: false,
    });

    update(recognizer, 1_000);
    const triggeredAgain = update(recognizer, 1_700);

    expect(triggeredAgain.triggered).toBe(true);
  });

  it('Cooldown内に解除して再度ポーズしても発動せず、Cooldown経過だけでは再発動しない', () => {
    const recognizer = createOraActionRecognizer();

    update(recognizer, 0);
    expect(update(recognizer, 700).triggered).toBe(true);
    recognizer.update(undefined, hand(0.8), 701);

    update(recognizer, 800);
    expect(update(recognizer, 1_500).triggered).toBe(false);
    expect(update(recognizer, 1_800).triggered).toBe(false);

    recognizer.update(undefined, hand(0.8), 1_801);
    update(recognizer, 1_900);
    const availableAgain = update(recognizer, 2_600);

    expect(availableAgain.triggered).toBe(true);
  });

  it('reset()でHoldとCooldownを初期化する', () => {
    const recognizer = createOraActionRecognizer();

    update(recognizer, 0);
    expect(update(recognizer, 700).triggered).toBe(true);

    recognizer.reset();
    const restarted = update(recognizer, 0);
    const triggered = update(recognizer, 700);

    expect(restarted).toEqual({ progress: 0, isHolding: true, triggered: false });
    expect(triggered.triggered).toBe(true);
  });
});
