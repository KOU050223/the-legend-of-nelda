import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthorityTransport } from './authority-transport';
import { createBattleRoomRegistry } from './battle-room-registry';
import type { AuthorityToClientMessage, ClientToAuthorityMessage } from './protocol';

function createTransportHarness() {
  let messageHandler:
    | ((connectionId: string, message: ClientToAuthorityMessage) => void)
    | undefined;
  let disconnectedHandler: ((connectionId: string) => void) | undefined;
  const sent: Array<{ connectionId: string; message: AuthorityToClientMessage }> = [];
  const transport: AuthorityTransport = {
    sendToClient(connectionId, message) {
      sent.push({ connectionId, message });
    },
    broadcast: () => undefined,
    disconnectClient: () => undefined,
    onClientConnected: () => () => undefined,
    onClientDisconnected(handler) {
      disconnectedHandler = handler;
      return () => {
        if (disconnectedHandler === handler) disconnectedHandler = undefined;
      };
    },
    onMessage(handler) {
      messageHandler = handler;
      return () => {
        if (messageHandler === handler) messageHandler = undefined;
      };
    },
  };
  return {
    sent,
    transport,
    receive(connectionId: string, message: ClientToAuthorityMessage) {
      messageHandler?.(connectionId, message);
    },
    disconnect(connectionId: string) {
      disconnectedHandler?.(connectionId);
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('createBattleRoomRegistry', () => {
  it('tokenToRoomIdごとにLOBBYを分離し、他roomの参加者を配信しない', () => {
    const harness = createTransportHarness();
    createBattleRoomRegistry({
      transport: harness.transport,
      tokenToRoomId: new Map([
        ['team-a', 'room-a'],
        ['team-b', 'room-b'],
      ]),
      createBattle: () => {
        throw new Error('START前なので呼ばれない');
      },
    });

    harness.receive('connection-a', {
      type: 'JOIN',
      token: 'team-a',
      participantId: 'participant-a',
    });
    harness.receive('connection-b', {
      type: 'JOIN',
      token: 'team-b',
      participantId: 'participant-b',
    });

    const latestLobbyFor = (connectionId: string) =>
      harness.sent.findLast(
        (
          entry,
        ): entry is typeof entry & {
          message: Extract<AuthorityToClientMessage, { type: 'LOBBY' }>;
        } => entry.connectionId === connectionId && entry.message.type === 'LOBBY',
      )?.message;

    expect(latestLobbyFor('connection-a')?.slots[0]?.participantId).toBe('participant-a');
    expect(
      latestLobbyFor('connection-a')?.slots.some((slot) => slot.participantId === 'participant-b'),
    ).toBe(false);
    expect(latestLobbyFor('connection-b')?.slots[0]?.participantId).toBe('participant-b');
    expect(
      latestLobbyFor('connection-b')?.slots.some((slot) => slot.participantId === 'participant-a'),
    ).toBe(false);
  });

  it('同じparticipantが別roomへJOINすると、旧roomの参加枠を即時解放する', () => {
    const harness = createTransportHarness();
    createBattleRoomRegistry({
      transport: harness.transport,
      tokenToRoomId: new Map([
        ['team-a', 'room-a'],
        ['team-b', 'room-b'],
      ]),
      createBattle: () => {
        throw new Error('START前なので呼ばれない');
      },
    });

    harness.receive('connection-old', {
      type: 'JOIN',
      token: 'team-a',
      participantId: 'participant-moving',
    });
    harness.receive('connection-teammate', {
      type: 'JOIN',
      token: 'team-a',
      participantId: 'participant-teammate',
    });
    harness.receive('connection-new', {
      type: 'JOIN',
      token: 'team-b',
      participantId: 'participant-moving',
    });

    const oldRoomLobby = harness.sent.findLast(
      (
        entry,
      ): entry is typeof entry & {
        message: Extract<AuthorityToClientMessage, { type: 'LOBBY' }>;
      } => entry.connectionId === 'connection-teammate' && entry.message.type === 'LOBBY',
    )?.message;

    expect(oldRoomLobby?.slots.some((slot) => slot.participantId === 'participant-moving')).toBe(
      false,
    );
    expect(oldRoomLobby?.slots[0]?.participantId).toBe('participant-teammate');
  });

  it('切断後30秒以内に復帰しないparticipantを旧roomから退出させる', () => {
    vi.useFakeTimers();
    const harness = createTransportHarness();
    createBattleRoomRegistry({
      transport: harness.transport,
      tokenToRoomId: new Map([['team-a', 'room-a']]),
      createBattle: () => {
        throw new Error('START前なので呼ばれない');
      },
    });
    harness.receive('connection-lost', {
      type: 'JOIN',
      token: 'team-a',
      participantId: 'participant-lost',
    });
    harness.receive('connection-teammate', {
      type: 'JOIN',
      token: 'team-a',
      participantId: 'participant-teammate',
    });

    harness.disconnect('connection-lost');
    vi.advanceTimersByTime(30_000);

    const lobby = harness.sent.findLast(
      (
        entry,
      ): entry is typeof entry & {
        message: Extract<AuthorityToClientMessage, { type: 'LOBBY' }>;
      } => entry.connectionId === 'connection-teammate' && entry.message.type === 'LOBBY',
    )?.message;
    expect(lobby?.slots.some((slot) => slot.participantId === 'participant-lost')).toBe(false);
  });
});
