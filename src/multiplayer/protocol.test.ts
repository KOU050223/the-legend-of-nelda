import { describe, expect, it } from 'vitest';

import type { BattleSnapshot } from '../game/session/boss-battle';
import { isAuthorityToClientMessage, isClientToAuthorityMessage, isGameAction } from './protocol';

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

describe('isGameAction', () => {
  it('ATTACKだけはintensity無しと有限数のintensityを受理する', () => {
    const actions: unknown[] = [
      { type: 'ATTACK' },
      { type: 'ATTACK', intensity: 0 },
      { type: 'ATTACK', intensity: 1 },
      // 範囲外の有限値は、Authority側のダメージ計算でクランプする。
      { type: 'ATTACK', intensity: -1 },
      { type: 'ATTACK', intensity: 2 },
    ];

    expect(actions.map(isGameAction)).toEqual([true, true, true, true, true]);
  });

  it('ATTACKの非有限・不正なintensityと、他の離散アクションのpayloadを拒否する', () => {
    const actions: unknown[] = [
      { type: 'ATTACK', intensity: Number.NaN },
      { type: 'ATTACK', intensity: Number.POSITIVE_INFINITY },
      { type: 'ATTACK', intensity: '1' },
      { type: 'ATTACK', intensity: 0.5, extra: true },
      { type: 'DODGE', intensity: 0.5 },
    ];

    expect(actions.map(isGameAction)).toEqual([false, false, false, false, false]);
  });
});

describe('isClientToAuthorityMessage', () => {
  it('共有tokenのJOINではopaqueなparticipantIdだけを受理しplayerIdやroleを受理しない', () => {
    const accepted = {
      type: 'JOIN',
      token: 'shared-room-token',
      participantId: 'participant-7f4d4c8a',
    };
    const rejected: unknown[] = [
      { type: 'JOIN', token: 'shared-room-token' },
      { type: 'JOIN', token: 'shared-room-token', participantId: 'pay-player' },
      {
        type: 'JOIN',
        token: 'shared-room-token',
        participantId: 'participant-7f4d4c8a',
        playerId: 'pay-player',
      },
      {
        type: 'JOIN',
        token: 'shared-room-token',
        participantId: 'participant-7f4d4c8a',
        role: 'PAY',
      },
    ];

    expect(isClientToAuthorityMessage(accepted)).toBe(true);
    expect(rejected.map(isClientToAuthorityMessage)).toEqual([false, false, false, false]);
  });

  it('JOINとACTIONの正しいエンベロープを受理する', () => {
    const messages = [
      { type: 'JOIN', token: 'token-pay', participantId: 'participant-pay' },
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

  it('SELECT_CHARACTERとSTARTは厳密なkeyだけを受理しclient identityを受け付けない', () => {
    const accepted: unknown[] = [
      { type: 'SELECT_CHARACTER', characterId: 'PAY' },
      { type: 'START' },
    ];
    const rejected: unknown[] = [
      { type: 'SELECT_CHARACTER', characterId: 'PAY', participantId: 'participant-pay' },
      { type: 'SELECT_CHARACTER', role: 'PAY' },
      { type: 'START', participantId: 'participant-pay' },
      { type: 'SELECT_CHARACTER', characterId: 'UNKNOWN' },
    ];

    expect(accepted.map(isClientToAuthorityMessage)).toEqual([true, true]);
    expect(rejected.map(isClientToAuthorityMessage)).toEqual([false, false, false, false]);
  });
});

describe('isAuthorityToClientMessage', () => {
  it('WELCOMEとSTATEとROSTERとWASSHOIを正しく絞り込む', () => {
    const messages = [
      { type: 'WELCOME', participantId: 'participant-pay', epoch: 1 },
      { type: 'STATE', battle: createBattleSnapshot() },
      { type: 'WASSHOI', event: { type: 'WASSHOI', intensity: 0.8, durationMs: 450 } },
      {
        type: 'ROSTER',
        slots: [
          { playerId: 'participant-odoruno', characterId: 'ODORUNO', connected: true },
          { playerId: 'participant-pay', characterId: 'PAY', connected: true },
          { playerId: 'participant-ora', characterId: 'ORA', connected: false },
        ],
        started: false,
      },
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

  it('ROSTERの不明なtype、余分なフィールド、slots内の型不正を拒否する', () => {
    const messages: unknown[] = [
      { type: 'UNKNOWN', slots: [], started: false },
      {
        type: 'ROSTER',
        slots: [],
        started: false,
        extra: true,
      },
      {
        type: 'ROSTER',
        slots: [{ playerId: 'participant-pay', characterId: 'UNKNOWN', connected: true }],
        started: false,
      },
      {
        type: 'ROSTER',
        slots: [{ playerId: 'participant-pay', characterId: 'PAY', connected: 'true' }],
        started: false,
      },
      {
        type: 'ROSTER',
        slots: [{ playerId: 1, characterId: 'PAY', connected: true }],
        started: false,
      },
      {
        type: 'ROSTER',
        slots: [{ playerId: 'participant-pay', characterId: 'PAY', connected: true, extra: true }],
        started: false,
      },
    ];

    expect(messages.map(isAuthorityToClientMessage)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('LOBBY/ROOM_FULL/REJECTEDを受理し、fullやrejectionのkey追加を拒否する', () => {
    const slots = [
      { participantId: 'participant-a', role: 'ODORUNO', connected: true },
      { participantId: 'participant-b', role: 'PAY', connected: true },
      { participantId: null, role: null, connected: false },
    ] as const;
    const accepted: unknown[] = [
      { type: 'LOBBY', slots, started: false, full: false },
      { type: 'ROOM_FULL', slots, started: false },
      { type: 'REJECTED', reason: 'ROLE_TAKEN' },
    ];
    const rejected: unknown[] = [
      { type: 'LOBBY', slots, started: false, full: false, extra: true },
      { type: 'ROOM_FULL', slots, started: false, extra: true },
      { type: 'REJECTED', reason: 'UNKNOWN' },
    ];

    expect(accepted.map(isAuthorityToClientMessage)).toEqual([true, true, true]);
    expect(rejected.map(isAuthorityToClientMessage)).toEqual([false, false, false]);
  });
});
