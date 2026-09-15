import { once } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, type RawData } from 'ws';

import {
  isAuthorityToClientMessage,
  type AuthorityToClientMessage,
} from '../src/multiplayer/protocol';
import { createAuthorityServer, type AuthorityServer } from './index';

interface TestClient {
  readonly socket: WebSocket;
  readonly messages: AuthorityToClientMessage[];
  readonly welcome: Extract<AuthorityToClientMessage, { type: 'WELCOME' }>;
}

const servers: AuthorityServer[] = [];
const clients: WebSocket[] = [];

const TEST_TOKEN_TO_PLAYER_ID: ReadonlyMap<string, string> = new Map([
  ['token-odoruno', 'odoruno-player'],
  ['token-pay', 'pay-player'],
  ['token-ora', 'ora-player'],
]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = (): void => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('condition was not met before timeout'));
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}

function decodeServerMessage(data: RawData): AuthorityToClientMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDataToString(data)) as unknown;
  } catch {
    return undefined;
  }
  return isAuthorityToClientMessage(parsed) ? parsed : undefined;
}

async function connectClient(server: AuthorityServer, token: string): Promise<TestClient> {
  await waitFor(() => server.port > 0);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const messages: AuthorityToClientMessage[] = [];
  socket.on('message', (data) => {
    const message = decodeServerMessage(data);
    if (message !== undefined) messages.push(message);
  });
  clients.push(socket);
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'JOIN', token }));
  await waitFor(() => messages.some((message) => message.type === 'WELCOME'));

  const welcome = messages.find(
    (message): message is Extract<AuthorityToClientMessage, { type: 'WELCOME' }> =>
      message.type === 'WELCOME',
  );
  if (welcome === undefined) throw new Error('WELCOME was not received');
  return { socket, messages, welcome };
}

function stateMessages(client: TestClient) {
  return client.messages.filter(
    (message): message is Extract<AuthorityToClientMessage, { type: 'STATE' }> =>
      message.type === 'STATE',
  );
}

async function closeClient(client: WebSocket): Promise<void> {
  if (client.readyState === WebSocket.CLOSED) return;
  const closed = once(client, 'close');
  client.close();
  await closed;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map(closeClient));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('createAuthorityServer', () => {
  it('3クライアントが同じBattleRoomのSTATEを共有しPAY以外へWASSHOIを配送する', async () => {
    const server = createAuthorityServer({
      port: 0,
      gameUpdateIntervalMs: 5,
      stateBroadcastIntervalMs: 10_000,
      tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID,
    });
    servers.push(server);
    const odoruno = await connectClient(server, 'token-odoruno');
    const pay = await connectClient(server, 'token-pay');
    const ora = await connectClient(server, 'token-ora');

    expect(
      new Set([odoruno.welcome.playerId, pay.welcome.playerId, ora.welcome.playerId]).size,
    ).toBe(3);
    expect(new Set([odoruno.welcome.epoch, pay.welcome.epoch, ora.welcome.epoch]).size).toBe(1);
    expect(odoruno.welcome.epoch).toBe(1);

    server.battleRoom.publishState();
    await waitFor(
      () =>
        stateMessages(odoruno).length >= 1 &&
        stateMessages(pay).length >= 1 &&
        stateMessages(ora).length >= 1,
    );
    const baseline = stateMessages(odoruno).at(-1);
    if (baseline === undefined) throw new Error('baseline STATE was not received');

    odoruno.socket.send(
      JSON.stringify({
        type: 'ACTION',
        epoch: odoruno.welcome.epoch,
        seq: 1,
        action: { type: 'ATTACK' },
      }),
    );
    await wait(650);
    server.battleRoom.publishState();
    const odorunoStateCount = stateMessages(odoruno).length;
    const payStateCount = stateMessages(pay).length;
    const oraStateCount = stateMessages(ora).length;
    await waitFor(
      () =>
        stateMessages(odoruno).length > odorunoStateCount &&
        stateMessages(pay).length > payStateCount &&
        stateMessages(ora).length > oraStateCount,
    );

    const synchronizedStates = [
      stateMessages(odoruno).at(-1),
      stateMessages(pay).at(-1),
      stateMessages(ora).at(-1),
    ];
    expect(synchronizedStates[0]?.battle).toEqual(synchronizedStates[1]?.battle);
    expect(synchronizedStates[1]?.battle).toEqual(synchronizedStates[2]?.battle);
    expect(synchronizedStates[0]?.battle.boss.hp).toBeLessThan(baseline.battle.boss.hp);

    const wasshoi = { type: 'WASSHOI' as const, intensity: 0.8, durationMs: 450 };
    const odorunoWasshoiCount = odoruno.messages.filter(
      (message) => message.type === 'WASSHOI',
    ).length;
    const payWasshoiCount = pay.messages.filter((message) => message.type === 'WASSHOI').length;
    const oraWasshoiCount = ora.messages.filter((message) => message.type === 'WASSHOI').length;
    server.battleRoom.publishWasshoi('pay-player', wasshoi);
    await waitFor(
      () =>
        odoruno.messages.filter((message) => message.type === 'WASSHOI').length ===
          odorunoWasshoiCount + 1 &&
        ora.messages.filter((message) => message.type === 'WASSHOI').length === oraWasshoiCount + 1,
    );

    expect(pay.messages.filter((message) => message.type === 'WASSHOI')).toHaveLength(
      payWasshoiCount,
    );
    expect(odoruno.messages.at(-1)).toEqual({ type: 'WASSHOI', event: wasshoi });
    expect(ora.messages.at(-1)).toEqual({ type: 'WASSHOI', event: wasshoi });

    await server.close();
  });

  it('再接続後は旧epochのACTIONを棄却し新epochのACTIONだけを反映してcloseを冪等化する', async () => {
    const server = createAuthorityServer({
      port: 0,
      gameUpdateIntervalMs: 5,
      stateBroadcastIntervalMs: 10_000,
      tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID,
    });
    servers.push(server);
    const first = await connectClient(server, 'token-pay');
    expect(first.welcome.epoch).toBe(1);
    await closeClient(first.socket);
    await wait(30);

    const reconnected = await connectClient(server, 'token-pay');
    expect(reconnected.welcome.playerId).toBe('pay-player');
    expect(reconnected.welcome.epoch).toBe(2);

    reconnected.socket.send(
      JSON.stringify({
        type: 'ACTION',
        epoch: first.welcome.epoch,
        seq: 1,
        action: { type: 'ATTACK' },
      }),
    );
    await wait(650);
    reconnected.socket.send(
      JSON.stringify({
        type: 'ACTION',
        epoch: reconnected.welcome.epoch,
        seq: 2,
        action: { type: 'ATTACK' },
      }),
    );
    await wait(650);

    server.battleRoom.publishState();
    await waitFor(() => stateMessages(reconnected).length >= 1);
    const state = stateMessages(reconnected).at(-1);
    if (state === undefined) throw new Error('STATE was not received');
    expect(state.battle.boss.hp).toBe(990);

    const firstClose = server.close();
    const secondClose = server.close();
    await Promise.all([firstClose, secondClose]);
    await waitFor(() => reconnected.socket.readyState === WebSocket.CLOSED);
    expect(reconnected.socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('portのlisten失敗時はgame update timerを止めプロセスを生かしたままにしない', async () => {
    const first = createAuthorityServer({ port: 0, tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID });
    servers.push(first);
    await waitFor(() => first.port > 0);

    const second = createAuthorityServer({
      port: first.port,
      gameUpdateIntervalMs: 5,
      tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID,
    });
    servers.push(second);
    const updateSpy = vi.spyOn(second.battleRoom, 'update');

    await wait(100);
    const callsAfterFailure = updateSpy.mock.calls.length;
    await wait(100);

    expect(updateSpy.mock.calls.length).toBe(callsAfterFailure);
  });
});
