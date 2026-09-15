import { describe, expect, it, vi } from 'vitest';

import type { BossBattle, BattleSnapshot } from '../game/session/boss-battle';
import type { GameAction } from '../game/types/game-action';
import type { CharacterId } from '../game/config/phase2-player-balance';
import type { AuthorityToClientMessage, ClientToAuthorityMessage } from './protocol';
import { createBattleRoom } from './battle-room';
import type { AuthorityTransport } from './authority-transport';

interface SentMessage {
  connectionId: string;
  message: AuthorityToClientMessage;
}

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
    players: [],
    barrier: null,
    finale: 'NONE',
  };
}

function createBattleHarness(
  submitImplementation?: (playerId: string, action: GameAction) => void,
) {
  const submitted: Array<{ playerId: string; action: GameAction }> = [];
  const updates: number[] = [];
  let elapsed = 0;
  const battle: BossBattle = {
    submit(playerId: string, action: GameAction) {
      submitted.push({ playerId, action });
      submitImplementation?.(playerId, action);
    },
    update(deltaSeconds: number) {
      updates.push(deltaSeconds);
      elapsed += deltaSeconds;
    },
    outcome: () => 'ONGOING' as const,
    advanceFinale: () => 'NONE' as const,
    boss: {
      update: () => undefined,
      damage: () => 0,
      breakBarrier: () => undefined,
      dangerZones: () => [],
      snapshot: () => createBattleSnapshot().boss,
      restore: () => undefined,
    },
    players: [],
    snapshot: () => createBattleSnapshot(),
    barrierViewFor: () => null,
  };

  return { battle, elapsed: () => elapsed, submitted, updates };
}

function createTransportHarness() {
  const messageHandlers = new Set<
    (connectionId: string, message: ClientToAuthorityMessage) => void
  >();
  const disconnectedHandlers = new Set<(connectionId: string) => void>();
  const sent: SentMessage[] = [];
  const disconnected: string[] = [];
  const transport: AuthorityTransport = {
    sendToClient(connectionId, message) {
      sent.push({ connectionId, message });
    },
    broadcast(message) {
      sent.push({ connectionId: '*', message });
    },
    disconnectClient(connectionId) {
      disconnected.push(connectionId);
    },
    onClientConnected: () => () => undefined,
    onClientDisconnected(handler) {
      disconnectedHandlers.add(handler);
      return () => disconnectedHandlers.delete(handler);
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
  };

  return {
    transport,
    sent,
    disconnected,
    receive(connectionId: string, message: ClientToAuthorityMessage): void {
      for (const handler of messageHandlers) handler(connectionId, message);
    },
    receiveMany(messages: readonly [string, ClientToAuthorityMessage][]): void {
      for (const [connectionId, message] of messages) {
        for (const handler of messageHandlers) handler(connectionId, message);
      }
    },
    notifyDisconnected(connectionId: string): void {
      for (const handler of disconnectedHandlers) handler(connectionId);
    },
  };
}

function captureThrown(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

function createRoom(
  battle: BossBattle,
  transport: AuthorityTransport,
  characterIds: ReadonlyMap<string, CharacterId> = new Map([
    ['pay-player', 'PAY'],
    ['odoruno-player', 'ODORUNO'],
    ['ora-player', 'ORA'],
  ]),
) {
  return createBattleRoom({
    battle,
    transport,
    tokenToPlayerId: new Map([
      ['token-pay', 'pay-player'],
      ['token-odoruno', 'odoruno-player'],
      ['token-ora', 'ora-player'],
    ]),
    playerIdToCharacterId: characterIds,
  });
}

function welcomeFor(sent: readonly SentMessage[], connectionId: string) {
  const message = sent.find(
    (
      entry,
    ): entry is SentMessage & { message: Extract<AuthorityToClientMessage, { type: 'WELCOME' }> } =>
      entry.connectionId === connectionId && entry.message.type === 'WELCOME',
  );
  return message?.message;
}

describe('createBattleRoom', () => {
  it('同じプレイヤーの再接続では古い接続を切断しepochを進める', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    const room = createRoom(battle.battle, transport.transport);

    transport.receiveMany([
      ['connection-old', { type: 'JOIN', token: 'token-pay' }],
      ['connection-new', { type: 'JOIN', token: 'token-pay' }],
    ]);

    const firstWelcome = welcomeFor(transport.sent, 'connection-old');
    const secondWelcome = welcomeFor(transport.sent, 'connection-new');

    expect(room).toBeDefined();
    expect(transport.disconnected).toEqual(['connection-old']);
    expect(firstWelcome?.epoch).toBe(1);
    expect(secondWelcome?.epoch).toBe(2);
  });

  it('再接続後に届いた旧epochのACTIONを受理しない', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    createRoom(battle.battle, transport.transport);

    transport.receiveMany([
      ['connection-old', { type: 'JOIN', token: 'token-pay' }],
      ['connection-new', { type: 'JOIN', token: 'token-pay' }],
      ['connection-old', { type: 'ACTION', epoch: 1, seq: 1, action: { type: 'ATTACK' } }],
    ]);

    expect(battle.submitted).toEqual([]);
  });

  it('同じepochで最大seq以下のACTIONを重複処理しない', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    createRoom(battle.battle, transport.transport);
    transport.receive('connection', { type: 'JOIN', token: 'token-pay' });

    transport.receiveMany([
      ['connection', { type: 'ACTION', epoch: 1, seq: 2, action: { type: 'ATTACK' } }],
      ['connection', { type: 'ACTION', epoch: 1, seq: 2, action: { type: 'ATTACK' } }],
      ['connection', { type: 'ACTION', epoch: 1, seq: 1, action: { type: 'INTERACT' } }],
      ['connection', { type: 'ACTION', epoch: 1, seq: 3, action: { type: 'REVIVE' } }],
    ]);

    expect(battle.submitted.map(({ action }) => action.type)).toEqual(['ATTACK', 'REVIVE']);
  });

  it('未知のtokenによるJOINを受理しない', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    createRoom(battle.battle, transport.transport);

    transport.receive('unknown-connection', { type: 'JOIN', token: 'invalid-token' });

    expect(welcomeFor(transport.sent, 'unknown-connection')).toBeUndefined();
    expect(transport.disconnected).toEqual(['unknown-connection']);
  });

  it('メッセージが無くてもupdateで経過時間を進める', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    const room = createRoom(battle.battle, transport.transport);

    room.update(0.25);

    expect(battle.updates).toEqual([0.25]);
    expect(battle.elapsed()).toBe(0.25);
  });

  it('updateの例外を呼び出し元へ伝播させない', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const battle = createBattleHarness();
    battle.battle.update = () => {
      throw new Error('update failed');
    };
    const transport = createTransportHarness();
    const room = createRoom(battle.battle, transport.transport);

    const thrown = captureThrown(() => room.update(0.1));
    error.mockRestore();

    expect(thrown).toBeUndefined();
  });

  it('STATE公開では現在のスナップショットをbroadcastする', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    const room = createRoom(battle.battle, transport.transport);

    room.publishState();

    expect(transport.sent).toEqual([
      { connectionId: '*', message: { type: 'STATE', battle: createBattleSnapshot() } },
    ]);
  });

  it('スナップショット取得の例外を呼び出し元へ伝播させない', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const battle = createBattleHarness();
    battle.battle.snapshot = () => {
      throw new Error('snapshot failed');
    };
    const transport = createTransportHarness();
    const room = createRoom(battle.battle, transport.transport);

    const thrown = captureThrown(() => room.publishState());
    error.mockRestore();

    expect(thrown).toBeUndefined();
    expect(transport.sent).toEqual([]);
  });

  it('STATE配信の例外を呼び出し元へ伝播させない', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    transport.transport.broadcast = () => {
      throw new Error('broadcast failed');
    };
    const room = createRoom(battle.battle, transport.transport);

    const thrown = captureThrown(() => room.publishState());
    error.mockRestore();

    expect(thrown).toBeUndefined();
  });

  it('PAY以外の接続だけへWasshoiEventを配送する', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    const room = createRoom(battle.battle, transport.transport);
    const event = { type: 'WASSHOI' as const, intensity: 0.9, durationMs: 800 };
    transport.receiveMany([
      ['pay-connection', { type: 'JOIN', token: 'token-pay' }],
      ['odoruno-connection', { type: 'JOIN', token: 'token-odoruno' }],
      ['ora-connection', { type: 'JOIN', token: 'token-ora' }],
    ]);

    room.publishWasshoi('pay-player', event);

    const wasshoiMessages = transport.sent.filter(
      (entry): entry is SentMessage & { message: { type: 'WASSHOI'; event: typeof event } } =>
        entry.message.type === 'WASSHOI',
    );
    expect(wasshoiMessages.map((entry) => entry.connectionId)).toEqual([
      'odoruno-connection',
      'ora-connection',
    ]);
    expect(wasshoiMessages.every((entry) => entry.message.event === event)).toBe(true);
  });

  it('1件のACTION例外後も後続メッセージを処理する', () => {
    let shouldThrow = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const battle = createBattleHarness(() => {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error('submit failed');
      }
    });
    const transport = createTransportHarness();
    createRoom(battle.battle, transport.transport);
    transport.receive('connection', { type: 'JOIN', token: 'token-pay' });

    transport.receiveMany([
      ['connection', { type: 'ACTION', epoch: 1, seq: 1, action: { type: 'ATTACK' } }],
      ['connection', { type: 'ACTION', epoch: 1, seq: 2, action: { type: 'INTERACT' } }],
    ]);
    error.mockRestore();

    expect(battle.submitted).toHaveLength(2);
    expect(battle.submitted[1]?.action.type).toBe('INTERACT');
  });

  it('切断された接続だけのidentityを解放する', () => {
    const battle = createBattleHarness();
    const transport = createTransportHarness();
    createRoom(battle.battle, transport.transport);
    transport.receive('connection', { type: 'JOIN', token: 'token-pay' });
    transport.notifyDisconnected('connection');

    transport.receive('connection', {
      type: 'ACTION',
      epoch: 1,
      seq: 1,
      action: { type: 'ATTACK' },
    });

    expect(battle.submitted).toEqual([]);
  });
});
