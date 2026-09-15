import { describe, expect, it } from 'vitest';
import { Group } from 'three';

import type { PlayerSnapshot } from '@/game/player/player-state';

import { syncCharacterRoot } from './character-actor';

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

describe('syncCharacterRoot', () => {
  it('同じActor Rootへプレイヤーの位置と向きを反映する', () => {
    const root = new Group();

    syncCharacterRoot(root, snapshot({ position: { x: 7, z: -3 }, rotationY: 1.25 }));

    expect(root.position.toArray()).toEqual([7, 0, -3]);
    expect(root.rotation.toArray().slice(0, 3)).toEqual([0, 1.25, 0]);
  });
});
