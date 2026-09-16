import { describe, expect, it } from 'vitest';

import { DEFAULT_REVIVAL } from '@/game/config/phase2-player-balance';
import type { PlayerSnapshot } from '@/game/player/player-state';

import {
  reviveProgressLabel,
  sleepCountdownRatio,
  sleepCountdownSeconds,
} from './character-actor-status';

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'odoruno',
    characterId: 'ODORUNO',
    status: 'FALLING_ASLEEP',
    hp: 0,
    hpMax: 100,
    position: { x: 1, z: 2 },
    rotationY: 0,
    swing: null,
    invulnerableUntil: null,
    dodgeReadyAt: 0,
    sleepAt: DEFAULT_REVIVAL.sleepCountdownMs,
    reviveInputs: 5,
    lastReviveAt: null,
    moveInput: { forward: 0, right: 0 },
    takenAt: 0,
    ...overrides,
  };
}

describe('蘇生ステータス表示', () => {
  it('蘇生回数を必要回数と合わせて表示する', () => {
    expect(reviveProgressLabel(snapshot())).toBe('蘇生中 5/14');
  });

  it('寝落ちまでの秒数と残り割合を計算する', () => {
    const player = snapshot();

    expect(sleepCountdownSeconds(player, 2_000)).toBe(28);
    expect(sleepCountdownRatio(player, 2_000)).toBeCloseTo(28 / 30);
  });

  it('寝落ち済みや通常状態では残り時間を表示しない', () => {
    expect(sleepCountdownSeconds(snapshot({ status: 'ACTIVE', sleepAt: null }), 2_000)).toBeNull();
    expect(sleepCountdownRatio(snapshot({ status: 'ASLEEP', sleepAt: null }), 2_000)).toBe(0);
  });
});
