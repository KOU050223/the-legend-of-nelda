import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LobbyMessage, RejectedMessage, RoomFullMessage, RosterMessage } from './protocol';
import type { ClientTransport } from './client-transport';

interface ClientHarness {
  readonly transport: ClientTransport;
  readonly client: {
    submit: () => void;
    selectCharacter: () => void;
    requestStart: () => void;
    onState: () => () => void;
    onWasshoi: () => () => void;
    onWelcome: (handler: (info: { playerId: string; epoch: number }) => void) => () => void;
    onRoster: (handler: (roster: RosterMessage) => void) => () => void;
    onLobby: (handler: (lobby: LobbyMessage) => void) => () => void;
    onRoomFull: (handler: (message: RoomFullMessage) => void) => () => void;
    onRejected: (handler: (message: RejectedMessage) => void) => () => void;
  };
  welcome: (info: { playerId: string; epoch: number }) => void;
  roster: (roster: RosterMessage) => void;
  disconnect: () => void;
}

function createClientHarness(): ClientHarness {
  let welcomeHandler: ((info: { playerId: string; epoch: number }) => void) | undefined;
  let rosterHandler: ((roster: RosterMessage) => void) | undefined;
  let disconnectedHandler: (() => void) | undefined;

  const transport: ClientTransport = {
    sendToAuthority: () => undefined,
    onMessage: () => () => undefined,
    onDisconnected(handler) {
      disconnectedHandler = handler;
      return () => {
        if (disconnectedHandler === handler) disconnectedHandler = undefined;
      };
    },
  };
  const client = {
    submit: () => undefined,
    selectCharacter: () => undefined,
    requestStart: () => undefined,
    onState: () => () => undefined,
    onWasshoi: () => () => undefined,
    onWelcome(handler: (info: { playerId: string; epoch: number }) => void) {
      welcomeHandler = handler;
      return () => {
        if (welcomeHandler === handler) welcomeHandler = undefined;
      };
    },
    onRoster(handler: (roster: RosterMessage) => void) {
      rosterHandler = handler;
      return () => {
        if (rosterHandler === handler) rosterHandler = undefined;
      };
    },
    onLobby: () => () => undefined,
    onRoomFull: () => () => undefined,
    onRejected: () => () => undefined,
  };

  return {
    transport,
    client,
    welcome: (info) => welcomeHandler?.(info),
    roster: (roster) => rosterHandler?.(roster),
    disconnect: () => disconnectedHandler?.(),
  };
}

async function loadSessionStore(token: string | null) {
  vi.resetModules();
  window.history.replaceState({}, '', token === null ? '/matching' : `/matching?token=${token}`);

  const clients: ClientHarness[] = [];
  const transportHarnesses: ClientHarness[] = [];
  const createdTokens: string[] = [];
  const createdParticipants: string[] = [];
  const createTransport = vi.fn<() => ClientTransport>(() => {
    const harness = createClientHarness();
    transportHarnesses.push(harness);
    return harness.transport;
  });
  const createClient = vi.fn<
    (
      options: Readonly<{ transport: ClientTransport; token: string; participantId: string }>,
    ) => ClientHarness['client']
  >(
    ({
      transport,
      token: suppliedToken,
      participantId: suppliedParticipantId,
    }: {
      readonly transport: ClientTransport;
      readonly token: string;
      readonly participantId: string;
    }) => {
      const harness = transportHarnesses.find((candidate) => candidate.transport === transport);
      if (harness === undefined) throw new Error('transport was not created');
      createdTokens.push(suppliedToken);
      createdParticipants.push(suppliedParticipantId);
      clients.push(harness);
      return harness.client;
    },
  );

  vi.doMock('./client-transport', () => ({ createWebSocketClientTransport: createTransport }));
  vi.doMock('./realtime-battle-client', () => ({ createRealtimeBattleClient: createClient }));

  const { useMultiplayerSessionStore } = await import('./session-store');
  return {
    clients,
    createClient,
    createTransport,
    createdTokens,
    createdParticipants,
    useMultiplayerSessionStore,
  };
}

afterEach(() => {
  vi.doUnmock('./client-transport');
  vi.doUnmock('./realtime-battle-client');
  vi.resetModules();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  window.sessionStorage.clear();
});

describe('useMultiplayerSessionStore', () => {
  it('sessionStorageのparticipantIdを接続間で再利用しtokenとは別に送る', async () => {
    window.sessionStorage.clear();
    const first = await loadSessionStore('shared-room-token');
    first.useMultiplayerSessionStore.getState().connect();
    const firstParticipant = first.createdParticipants[0];
    if (firstParticipant === undefined) throw new Error('participantId was not created');

    vi.resetModules();
    const second = await loadSessionStore('shared-room-token');
    second.useMultiplayerSessionStore.getState().connect();

    expect(firstParticipant).toMatch(/^participant-/);
    expect(second.createdParticipants).toEqual([firstParticipant]);
    expect(second.createdTokens).toEqual(['shared-room-token']);
  });

  it('URLからtokenを一度だけ読み、pushState後もそのtokenで接続する', async () => {
    const { createTransport, createdTokens, useMultiplayerSessionStore } =
      await loadSessionStore('token-pay');
    window.history.pushState({}, '', '/matching');

    useMultiplayerSessionStore.getState().connect();

    expect(createTransport).toHaveBeenCalledOnce();
    expect(createdTokens).toEqual(['token-pay']);
    expect(useMultiplayerSessionStore.getState()).toMatchObject({
      token: 'token-pay',
      status: 'CONNECTING',
    });
  });

  it('接続中の重複接続を防ぎ、切断後は新しい接続で再開する', async () => {
    const { clients, createTransport, useMultiplayerSessionStore } =
      await loadSessionStore('token-pay');
    const roster: RosterMessage = {
      type: 'ROSTER',
      slots: [{ playerId: 'pay-player', characterId: 'PAY', connected: true }],
      started: false,
    };

    useMultiplayerSessionStore.getState().connect();
    useMultiplayerSessionStore.getState().connect();
    const firstClient = clients[0];
    if (firstClient === undefined) throw new Error('client was not created');
    firstClient.welcome({ playerId: 'pay-player', epoch: 1 });
    firstClient.roster(roster);

    expect(createTransport).toHaveBeenCalledOnce();
    expect(useMultiplayerSessionStore.getState()).toMatchObject({
      status: 'CONNECTED',
      localPlayerId: 'pay-player',
      roster,
    });

    firstClient.disconnect();

    expect(useMultiplayerSessionStore.getState()).toMatchObject({
      status: 'DISCONNECTED',
      client: null,
      localPlayerId: null,
      roster: null,
    });

    useMultiplayerSessionStore.getState().connect();

    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it('tokenが無い通常導線でもそのまま接続する(token方式は廃止済み)', async () => {
    const { createTransport, createdTokens, useMultiplayerSessionStore } =
      await loadSessionStore(null);

    useMultiplayerSessionStore.getState().connect();

    expect(createTransport).toHaveBeenCalledOnce();
    expect(createdTokens).toHaveLength(1);
    expect(createdTokens[0]).toEqual(expect.any(String));
    expect(createdTokens[0]?.length).toBeGreaterThan(0);
    expect(useMultiplayerSessionStore.getState()).toMatchObject({
      token: null,
      status: 'CONNECTING',
    });
  });
});
