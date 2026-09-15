import { once } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import type { ClientToAuthorityMessage } from '../src/multiplayer/protocol';
import { createNodeAuthorityTransport } from './node-authority-transport';

const servers: WebSocketServer[] = [];
const clients: WebSocket[] = [];

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
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

async function createHarness(): Promise<{
  server: WebSocketServer;
  transport: ReturnType<typeof createNodeAuthorityTransport>;
  url: string;
}> {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  const transport = createNodeAuthorityTransport(server);
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('WebSocketServer did not expose a TCP address');
  }
  return { server, transport, url: `ws://127.0.0.1:${address.port}` };
}

async function openClient(url: string): Promise<WebSocket> {
  const client = new WebSocket(url);
  clients.push(client);
  await once(client, 'open');
  return client;
}

async function closeClient(client: WebSocket): Promise<void> {
  if (client.readyState === WebSocket.CLOSED) return;
  const closed = once(client, 'close');
  client.close();
  await closed;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map(closeClient));

  await Promise.all(
    servers.splice(0).map((server) => {
      if (server.address() === null) return Promise.resolve();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});

describe('createNodeAuthorityTransport', () => {
  it('複数接続へ一意のconnectionIdを発行し接続通知を1回だけ行う', async () => {
    const { transport, url } = await createHarness();
    const connected: string[] = [];
    transport.onClientConnected((connectionId) => connected.push(connectionId));

    const first = await openClient(url);
    const second = await openClient(url);
    await waitFor(() => connected.length === 2);

    expect(connected).toHaveLength(2);
    expect(new Set(connected).size).toBe(2);

    await closeClient(first);
    await closeClient(second);
  });

  it('不正なJSONをログしてonMessageへ配送しない', async () => {
    const { server, transport, url } = await createHarness();
    const received: ClientToAuthorityMessage[] = [];
    transport.onMessage((_connectionId, message) => received.push(message));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = await openClient(url);

    client.send('not json');
    await waitFor(() => error.mock.calls.length > 0);

    expect(received).toEqual([]);
    expect(server.address()).not.toBeNull();
    error.mockRestore();
  });

  it('protocol違反のメッセージをonMessageへ配送しない', async () => {
    const { transport, url } = await createHarness();
    const received: ClientToAuthorityMessage[] = [];
    transport.onMessage((_connectionId, message) => received.push(message));
    const client = await openClient(url);

    client.send(
      JSON.stringify({
        type: 'ACTION',
        epoch: 1,
        seq: 0,
        action: { type: 'ATTACK' },
        extra: true,
      }),
    );
    await wait(30);

    expect(received).toEqual([]);
  });

  it('handlerの例外を隔離して他のhandlerへ配送する', async () => {
    const { transport, url } = await createHarness();
    const received: ClientToAuthorityMessage[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    transport.onMessage(() => {
      throw new Error('handler failed');
    });
    transport.onMessage((_connectionId, message) => received.push(message));
    const client = await openClient(url);

    client.send(JSON.stringify({ type: 'JOIN', token: 'token-pay' }));
    await waitFor(() => received.length === 1);

    expect(received).toEqual([{ type: 'JOIN', token: 'token-pay' }]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('クライアント切断時の通知を1回だけ行う', async () => {
    const { transport, url } = await createHarness();
    const connected: string[] = [];
    const disconnected: string[] = [];
    transport.onClientConnected((connectionId) => connected.push(connectionId));
    transport.onClientDisconnected((connectionId) => disconnected.push(connectionId));
    const client = await openClient(url);
    await waitFor(() => connected.length === 1);

    client.close();
    client.close();
    await waitFor(() => disconnected.length === 1);
    await wait(30);

    expect(disconnected).toEqual([connected[0]]);
  });

  it('socket error後のcloseでも切断通知を重複させず接続を解放する', async () => {
    const { server, transport, url } = await createHarness();
    const connected: string[] = [];
    const disconnected: string[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    transport.onClientConnected((connectionId) => connected.push(connectionId));
    transport.onClientDisconnected((connectionId) => disconnected.push(connectionId));
    const client = await openClient(url);
    await waitFor(() => connected.length === 1);
    const connectionId = connected[0];
    if (connectionId === undefined) throw new Error('connectionId was not assigned');
    const serverSocket = [...server.clients][0];
    if (serverSocket === undefined) throw new Error('server socket was not found');

    serverSocket.emit('error', new Error('synthetic socket error'));
    serverSocket.emit('close');
    serverSocket.emit('close');
    await waitFor(() => disconnected.length === 1);

    expect(disconnected).toEqual([connectionId]);
    expect(() =>
      transport.sendToClient(connectionId, {
        type: 'WELCOME',
        playerId: 'pay-player',
        epoch: 1,
      }),
    ).not.toThrow();
    error.mockRestore();
    await closeClient(client);
  });

  it('切断済みconnectionIdへのsendとbroadcastを例外なく無視する', async () => {
    const { transport, url } = await createHarness();
    let connectionId: string | undefined;
    transport.onClientConnected((id) => {
      connectionId = id;
    });
    const client = await openClient(url);
    await waitFor(() => connectionId !== undefined);
    if (connectionId === undefined) throw new Error('connectionId was not assigned');
    const id = connectionId;

    await closeClient(client);

    expect(() =>
      transport.sendToClient(id, { type: 'WELCOME', playerId: 'pay-player', epoch: 1 }),
    ).not.toThrow();
    expect(() =>
      transport.broadcast({ type: 'WELCOME', playerId: 'pay-player', epoch: 1 }),
    ).not.toThrow();
  });

  it('disconnectClientでクライアント側の接続を閉じる', async () => {
    const { transport, url } = await createHarness();
    let connectionId: string | undefined;
    transport.onClientConnected((id) => {
      connectionId = id;
    });
    const client = await openClient(url);
    await waitFor(() => connectionId !== undefined);
    if (connectionId === undefined) throw new Error('connectionId was not assigned');

    const closed = once(client, 'close');
    transport.disconnectClient(connectionId);
    await closed;

    expect(client.readyState).toBe(WebSocket.CLOSED);
  });
});
