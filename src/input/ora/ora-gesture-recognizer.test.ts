import { describe, expect, it } from 'vitest';

import { createOraGestureRecognizer } from './ora-gesture-recognizer';
import type { MarkerObservation } from './types';

function observation(capturedAt: number, leftX = 0.2, rightX = 0.4): MarkerObservation {
  return {
    capturedAt,
    left: { x: leftX, y: 0.6, size: 0.2, velocityX: 0, velocityY: 0 },
    right: { x: rightX, y: 0.6, size: 0.2, velocityX: 0, velocityY: 0 },
  };
}

function oraPose(capturedAt: number): MarkerObservation {
  return {
    capturedAt,
    left: { x: 0.2, y: 0.2, size: 0.2, velocityX: 0, velocityY: 0 },
    right: { x: 0.8, y: 0.2, size: 0.2, velocityX: 0, velocityY: 0 },
  };
}

describe('createOraGestureRecognizer', () => {
  it('両マーカーの中心が左へ入ると MOVE_LEFT を保持する', () => {
    const recognizer = createOraGestureRecognizer();

    const result = recognizer.recognize(observation(0));

    expect(result.move).toBe('MOVE_LEFT');
  });

  it('デッドゾーン内では直前の移動を保持し、解除境界でNEUTRALへ戻る', () => {
    const recognizer = createOraGestureRecognizer();
    recognizer.recognize(observation(0));

    const held = recognizer.recognize(observation(16, 0.28, 0.64));
    const released = recognizer.recognize(observation(32, 0.32, 0.64));

    expect(held.move).toBe('MOVE_LEFT');
    expect(released.move).toBeNull();
  });

  it('RIGHTを素早く振ると ATTACK を1回だけ出す', () => {
    const recognizer = createOraGestureRecognizer();
    const frame = observation(1000);
    const hand = { capturedAt: 1000, right: { x: 0.5, y: 0.5, velocityX: 1.3, velocityY: 0 } };

    const first = recognizer.recognize(frame, hand);
    const continued = recognizer.recognize(
      { ...frame, capturedAt: 1100 },
      { ...hand, capturedAt: 1100 },
    );

    expect(first.actions).toEqual(['ATTACK']);
    expect(continued.actions).toEqual([]);
  });

  it('認識を保てる小さな横移動でも ATTACK を出す', () => {
    const recognizer = createOraGestureRecognizer();
    const frame = observation(1000);
    const hand = { capturedAt: 1000, right: { x: 0.5, y: 0.5, velocityX: 0.35, velocityY: 0 } };

    const result = recognizer.recognize(frame, hand);

    expect(result.actions).toEqual(['ATTACK']);
  });

  it('両マーカーを上で広げて1秒保つと ORA_ACTION を出す', () => {
    const recognizer = createOraGestureRecognizer();
    recognizer.recognize(oraPose(0));

    const result = recognizer.recognize(oraPose(1000));

    expect(result.oraPoseProgress).toBe(1);
    expect(result.actions).toEqual(['ORA_ACTION']);
  });

  it('マーカーを見失うと移動とORAホールドを解除する', () => {
    const recognizer = createOraGestureRecognizer();
    recognizer.recognize(observation(0));

    const result = recognizer.recognize({ capturedAt: 16, left: observation(16).left! });

    expect(result).toMatchObject({ move: null, oraPoseProgress: 0, actions: [] });
  });
});
