import { describe, expect, it } from 'vitest';

import type { BattleSnapshot } from '../game/session/boss-battle';
import { isAuthorityToClientMessage, isClientToAuthorityMessage } from './protocol';

function createBattleSnapshot(): BattleSnapshot {
  return {
    boss: {
      hp: 1000,
      hpMax: 1000,
      phase: 'INTRO',
      position: { x: 0, z: 0 },
      rotationY: 0,
      attackCount: 0,
      activeAttack: null,
      bossDownUntil: null,
      nextAttackAt: 0,
      takenAt: 0,
    },
    players: [
      {
        id: 'pay-player',
        characterId: 'PAY',
        status: 'ACTIVE',
        hp: 100,
        hpMax: 100,
        position: { x: 0, z: 0 },
        rotationY: 0,
        swing: null,
        invulnerableUntil: null,
        dodgeReadyAt: 0,
        sleepAt: null,
        reviveInputs: 0,
        lastReviveAt: null,
        moveInput: { forward: 0, right: 0 },
        takenAt: 0,
      },
    ],
    barrier: null,
    finale: 'NONE',
  };
}

describe('isClientToAuthorityMessage', () => {
  it('JOINとACTIONの正しいエンベロープを受理する', () => {
    const messages = [
      { type: 'JOIN', token: 'token-pay' },
      { type: 'ACTION', epoch: 1, seq: 0, action: { type: 'ATTACK' } },
      {
        type: 'ACTION',
        epoch: 1,
        seq: 1,
        action: { type: 'MOVE', input: { forward: 1, right: 0 } },
      },
    ];

    const result = messages.every(isClientToAuthorityMessage);

    expect(result).toBe(true);
  });

  it('未知の値と追加フィールド付きエンベロープを拒否する', () => {
    const messages: unknown[] = [
      null,
      { type: 'UNKNOWN', token: 'token-pay' },
      { type: 'JOIN', token: 1 },
      { type: 'ACTION', epoch: 1, seq: 0, action: { type: 'MOVE', input: { forward: 1 } } },
      { type: 'JOIN', token: 'token-pay', extra: true },
    ];

    const result = messages.map(isClientToAuthorityMessage);

    expect(result).toEqual([false, false, false, false, false]);
  });
});

describe('isAuthorityToClientMessage', () => {
  it('WELCOMEとSTATEとWASSHOIを正しく絞り込む', () => {
    const messages = [
      { type: 'WELCOME', playerId: 'pay-player', epoch: 1 },
      { type: 'STATE', battle: createBattleSnapshot() },
      { type: 'WASSHOI', event: { type: 'WASSHOI', intensity: 0.8, durationMs: 450 } },
    ];

    const result = messages.every(isAuthorityToClientMessage);

    expect(result).toBe(true);
  });

  it('STATEの不正なスナップショットを拒否する', () => {
    const messages: unknown[] = [
      { type: 'STATE', battle: { boss: null, players: [], finale: 'NONE' } },
      { type: 'STATE', battle: { boss: {}, players: [], finale: 'UNKNOWN' } },
      { type: 'STATE', battle: { boss: {}, players: [] } },
    ];

    const result = messages.map(isAuthorityToClientMessage);

    expect(result).toEqual([false, false, false]);
  });
});
