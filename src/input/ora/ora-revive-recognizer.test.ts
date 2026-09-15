import { describe, expect, it } from 'vitest';

import { REVIVE_INPUT_INTERVAL_MS } from '@/game/config/phase2-player-balance';

import { createOraReviveRecognizer } from './ora-revive-recognizer';
import type { HandObservation } from './types';

type Hand = NonNullable<HandObservation['left']>;

function hand(x: number, y = 0.55, isOpen = false): Hand {
  return { x, y, velocityX: 0, velocityY: 0, isOpen };
}

describe('createOraReviveRecognizer', () => {
  it('両手を閉じて近づけた合掌を保持すると即時と一定間隔でREVIVEを出す', () => {
    const recognizer = createOraReviveRecognizer();
    const left = hand(0.44);
    const right = hand(0.56);

    expect(recognizer.update(left, right, 1_000).triggered).toBe(true);
    expect(recognizer.update(left, right, 1_000 + REVIVE_INPUT_INTERVAL_MS - 1).triggered).toBe(
      false,
    );
    expect(recognizer.update(left, right, 1_000 + REVIVE_INPUT_INTERVAL_MS).triggered).toBe(true);
  });

  it('合掌を解除すると連打周期をリセットする', () => {
    const recognizer = createOraReviveRecognizer();
    const left = hand(0.44);
    const right = hand(0.56);

    recognizer.update(left, right, 1_000);
    recognizer.update(left, right, 1_100);
    recognizer.update(left, hand(0.8), 1_101);

    expect(recognizer.update(left, right, 1_102).triggered).toBe(true);
  });

  it.each([
    ['両手が開いている', hand(0.44, 0.55, true), hand(0.56, 0.55, true)],
    ['両手が離れている', hand(0.2), hand(0.8)],
    ['片手を見失っている', undefined, hand(0.56)],
  ])('%s状態ではREVIVEを出さない', (_condition, left, right) => {
    const recognizer = createOraReviveRecognizer();

    expect(recognizer.update(left, right, 1_000).triggered).toBe(false);
  });
});
