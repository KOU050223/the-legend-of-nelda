import { once } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, type RawData } from 'ws';

import {
  isAuthorityToClientMessage,
  type AuthorityToClientMessage,
  type LobbyMessage,
} from '../src/multiplayer/protocol';
import { createAuthorityServer, type AuthorityServer } from './index';

interface TestClient {
  readonly socket: WebSocket;
  readonly messages: AuthorityToClientMessage[];
  readonly welcome: Extract<AuthorityToClientMessage, { type: 'WELCOME'; participantId: string }>;
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

async function connectClient(
  server: AuthorityServer,
  token: string,
  participantId = 'participant-' + token.replace(/[^a-z0-9]+/gi, '-'),
): Promise<TestClient> {
  await waitFor(() => server.port > 0);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const messages: AuthorityToClientMessage[] = [];
  socket.on('message', (data) => {
    const message = decodeServerMessage(data);
    if (message !== undefined) messages.push(message);
  });
  clients.push(socket);
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'JOIN', token, participantId }));
  await waitFor(() => messages.some((message) => message.type === 'WELCOME'));

  const welcome = messages.find(
    (
      message,
    ): message is Extract<AuthorityToClientMessage, { type: 'WELCOME'; participantId: string }> =>
      message.type === 'WELCOME' && 'participantId' in message,
  );
  if (welcome === undefined) throw new Error('WELCOME was not received');
  return { socket, messages, welcome };
}

async function connectRawClient(
  server: AuthorityServer,
  token: string,
  participantId: string,
): Promise<{ socket: WebSocket; messages: AuthorityToClientMessage[] }> {
  await waitFor(() => server.port > 0);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const messages: AuthorityToClientMessage[] = [];
  socket.on('message', (data) => {
    const message = decodeServerMessage(data);
    if (message !== undefined) messages.push(message);
  });
  clients.push(socket);
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'JOIN', token, participantId }));
  await waitFor(() => messages.some((message) => message.type === 'ROOM_FULL'));
  return { socket, messages };
}

function stateMessages(client: TestClient) {
  return client.messages.filter(
    (message): message is Extract<AuthorityToClientMessage, { type: 'STATE' }> =>
      message.type === 'STATE',
  );
}

function lobbyMessages(client: TestClient): LobbyMessage[] {
  return client.messages.filter((message): message is LobbyMessage => message.type === 'LOBBY');
}

async function selectAndStart(
  odoruno: TestClient,
  pay: TestClient,
  ora: TestClient,
): Promise<void> {
  odoruno.socket.send(JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'ODORUNO' }));
  pay.socket.send(JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'PAY' }));
  ora.socket.send(JSON.stringify({ type: 'SELECT_CHARACTER', characterId: 'ORA' }));
  await waitFor(() =>
    lobbyMessages(odoruno).some(
      ({ slots }) =>
        slots.every((slot) => slot.connected && slot.role !== null) &&
        new Set(slots.map((slot) => slot.role)).size === 3,
    ),
  );
  odoruno.socket.send(JSON.stringify({ type: 'START' }));
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
  it('tokenToRoomIdごとにlobbyと開始済みBattleを分離する', async () => {
    const server = createAuthorityServer({
      port: 0,
      stateBroadcastIntervalMs: 10_000,
      tokenToRoomId: new Map([
        ['team-a', 'room-a'],
        ['team-b', 'room-b'],
      ]),
    });
    servers.push(server);

    const teamA = await Promise.all(
      ['participant-a1', 'participant-a2', 'participant-a3'].map((participantId) =>
        connectClient(server, 'team-a', participantId),
      ),
    );
    const teamB = await Promise.all(
      ['participant-b1', 'participant-b2', 'participant-b3'].map((participantId) =>
        connectClient(server, 'team-b', participantId),
      ),
    );
    const [aOdoruno, aPay, aOra] = teamA;
    const [bOdoruno] = teamB;
    if (
      aOdoruno === undefined ||
      aPay === undefined ||
      aOra === undefined ||
      bOdoruno === undefined
    ) {
      throw new Error('expected three clients in each room');
    }

    await selectAndStart(aOdoruno, aPay, aOra);
    await waitFor(() => lobbyMessages(aOdoruno).some(({ started }) => started));

    expect(lobbyMessages(bOdoruno).at(-1)).toMatchObject({
      started: false,
      slots: expect.arrayContaining([
        expect.objectContaining({ participantId: 'participant-b1' }),
        expect.objectContaining({ participantId: 'participant-b2' }),
        expect.objectContaining({ participantId: 'participant-b3' }),
      ]),
    });

    server.battleRoom.publishState();
    await waitFor(() => stateMessages(aOdoruno).length > 0);
    expect(stateMessages(bOdoruno)).toHaveLength(0);
  });

  it('3人揃うまでSTATEのboss.hpを固定し、started後のACTIONでboss.hpを変化させる', async () => {
    const server = createAuthorityServer({
      port: 0,
      gameUpdateIntervalMs: 5,
      stateBroadcastIntervalMs: 10_000,
      tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID,
    });
    servers.push(server);

    const odoruno = await connectClient(server, 'token-odoruno');
    const pay = await connectClient(server, 'token-pay');

    server.battleRoom.publishState();
    const ora = await connectClient(server, 'token-ora');
    await wait(50);
    expect(stateMessages(odoruno)).toHaveLength(0);
    expect(stateMessages(pay)).toHaveLength(0);

    await selectAndStart(odoruno, pay, ora);
    await waitFor(
      () =>
        lobbyMessages(odoruno).some(({ started }) => started) &&
        lobbyMessages(pay).some(({ started }) => started) &&
        lobbyMessages(ora).some(({ started }) => started),
    );

    const baseline = lobbyMessages(odoruno).at(-1);
    if (baseline === undefined) throw new Error('started LOBBY was not received');

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
    await waitFor(() => stateMessages(odoruno).length >= 1 && stateMessages(pay).length >= 1);

    expect(stateMessages(odoruno).at(-1)?.battle.boss.hp).toBeLessThan(1000);
  });

  it('開始済みroomのLEAVEは参加者を外し、残りのclientをMATCHINGへ戻す', async () => {
    const server = createAuthorityServer({
      port: 0,
      stateBroadcastIntervalMs: 10_000,
      tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID,
    });
    servers.push(server);
    const odoruno = await connectClient(server, 'token-odoruno');
    const pay = await connectClient(server, 'token-pay');
    const ora = await connectClient(server, 'token-ora');
    await selectAndStart(odoruno, pay, ora);
    await waitFor(() => lobbyMessages(odoruno).some(({ started }) => started));

    pay.socket.send(JSON.stringify({ type: 'LEAVE' }));

    await waitFor(() => {
      const lobby = lobbyMessages(odoruno).at(-1);
      return (
        lobby?.started === false &&
        lobby.slots.every((slot) => slot.participantId !== 'participant-token-pay')
      );
    });
    expect(lobbyMessages(odoruno).at(-1)).toMatchObject({ started: false });
  });

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
    await selectAndStart(odoruno, pay, ora);
    await waitFor(() => lobbyMessages(odoruno).some(({ started }) => started));

    expect(
      new Set([odoruno.welcome.participantId, pay.welcome.participantId, ora.welcome.participantId])
        .size,
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
    server.battleRoom.publishWasshoi('participant-token-pay', wasshoi);
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

  it('4人目はROOM_FULLだけを受け取りSTATE/START権限を持たない', async () => {
    const server = createAuthorityServer({
      port: 0,
      gameUpdateIntervalMs: 5,
      stateBroadcastIntervalMs: 10_000,
      roomToken: 'shared-room-token',
    });
    servers.push(server);
    const odoruno = await connectClient(server, 'shared-room-token', 'participant-a');
    const pay = await connectClient(server, 'shared-room-token', 'participant-b');
    const ora = await connectClient(server, 'shared-room-token', 'participant-c');
    const fourth = await connectRawClient(server, 'shared-room-token', 'participant-d');

    expect(fourth.messages.some((message) => message.type === 'ROOM_FULL')).toBe(true);
    await selectAndStart(odoruno, pay, ora);
    await waitFor(() => lobbyMessages(odoruno).some(({ started }) => started));
    server.battleRoom.publishState();
    await waitFor(() => stateMessages(odoruno).length >= 1);
    await wait(30);

    expect(stateMessages({ ...odoruno }).length).toBeGreaterThan(0);
    expect(fourth.messages.filter((message) => message.type === 'STATE')).toHaveLength(0);
    fourth.socket.send(JSON.stringify({ type: 'START' }));
    await wait(30);
    expect(fourth.messages.filter((message) => message.type === 'STATE')).toHaveLength(0);
  });

  it('token設定なしでも同じ共有tokenの3人はJOINでき、異なる位置へspawnする', async () => {
    // roomToken/tokenToPlayerId/tokenToRoomIdのいずれも渡さない
    // = NELDA_ROOM_TOKEN未設定のデフォルト起動と同じ状態。tokenがroomを分ける。
    const server = createAuthorityServer({
      port: 0,
      gameUpdateIntervalMs: 5,
      stateBroadcastIntervalMs: 10_000,
    });
    servers.push(server);

    const odoruno = await connectClient(server, 'open-room', 'participant-open-a');
    const pay = await connectClient(server, 'open-room', 'participant-open-b');
    const ora = await connectClient(server, 'open-room', 'participant-open-c');

    await selectAndStart(odoruno, pay, ora);
    await waitFor(() => lobbyMessages(odoruno).some(({ started }) => started));
    server.battleRoom.publishState();
    await waitFor(() => stateMessages(odoruno).length >= 1);

    const state = stateMessages(odoruno).at(-1);
    if (state === undefined) throw new Error('STATE was not received');
    expect(state.battle.players).toHaveLength(3);
    const positions = state.battle.players.map(
      (player) => `${player.position.x},${player.position.z}`,
    );
    expect(new Set(positions).size).toBe(3);
  });

  it('再接続後は旧epochのACTIONを棄却し新epochのACTIONだけを反映してcloseを冪等化する', async () => {
    const server = createAuthorityServer({
      port: 0,
      gameUpdateIntervalMs: 5,
      stateBroadcastIntervalMs: 10_000,
      tokenToPlayerId: TEST_TOKEN_TO_PLAYER_ID,
    });
    servers.push(server);
    const first = await connectClient(server, 'token-pay', 'participant-pay');
    expect(first.welcome.epoch).toBe(1);
    const odoruno = await connectClient(server, 'token-odoruno', 'participant-odoruno');
    const ora = await connectClient(server, 'token-ora', 'participant-ora');
    await selectAndStart(odoruno, first, ora);
    await waitFor(() => lobbyMessages(first).some(({ started }) => started));
    await closeClient(first.socket);
    await wait(30);

    const reconnected = await connectClient(server, 'token-pay', 'participant-pay');
    expect(reconnected.welcome.participantId).toBe('participant-pay');
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
