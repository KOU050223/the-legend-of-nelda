import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWebSocketClientTransport } from './client-transport';

type FakeListener = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readonly listeners = new Map<string, Set<FakeListener>>();
  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? new Set<FakeListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('socket is not open');
    this.sent.push(data);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }

  message(data: string): void {
    this.emit('message', { data });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: FakeWebSocket,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: originalWebSocket,
    writable: true,
  });
});

describe('createWebSocketClientTransport', () => {
  it('接続前の送信を接続確立後に1回だけ送る', () => {
    const transport = createWebSocketClientTransport('wss://example.test/session');
    const socket = FakeWebSocket.instances[0];

    transport.sendToAuthority({ type: 'JOIN', token: 'token-pay' });
    socket?.open();

    expect(socket?.url).toBe('wss://example.test/session');
    expect(socket?.sent).toEqual([JSON.stringify({ type: 'JOIN', token: 'token-pay' })]);
  });

  it('複数の受信購読へ配送し解除後は呼び出さない', () => {
    const transport = createWebSocketClientTransport('wss://example.test/session');
    const socket = FakeWebSocket.instances[0];
    const received: string[] = [];
    const firstUnsubscribe = transport.onMessage((message) => received.push(message.type));
    transport.onMessage(() => received.push('second'));

    socket?.message(JSON.stringify({ type: 'WELCOME', playerId: 'pay-player', epoch: 1 }));
    firstUnsubscribe();
    socket?.message(JSON.stringify({ type: 'WELCOME', playerId: 'pay-player', epoch: 2 }));

    expect(received).toEqual(['WELCOME', 'second', 'second']);
  });

  it('不正なJSONを無視し切断通知を購読解除できる', () => {
    const transport = createWebSocketClientTransport('wss://example.test/session');
    const socket = FakeWebSocket.instances[0];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let disconnects = 0;
    const unsubscribe = transport.onDisconnected(() => {
      disconnects += 1;
    });

    socket?.message('{not-json');
    socket?.close();
    unsubscribe();
    socket?.close();
    error.mockRestore();

    expect(disconnects).toBe(1);
  });
});
