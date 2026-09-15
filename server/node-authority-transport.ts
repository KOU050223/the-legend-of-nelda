import { randomUUID } from 'node:crypto';

import { WebSocket, type WebSocketServer } from 'ws';

import type { AuthorityTransport } from '../src/multiplayer/authority-transport';
import {
  isClientToAuthorityMessage,
  type AuthorityToClientMessage,
  type ClientToAuthorityMessage,
} from '../src/multiplayer/protocol';

interface ConnectionState {
  readonly socket: WebSocket;
  disconnected: boolean;
}

function reportTransportError(error: unknown): void {
  console.error('Node authority transport message handling failed', error);
}

function rawDataToString(data: WebSocket.RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}

/** `WebSocketServer`をBattleRoom用のAuthorityTransportへ接続するNode実装。 */
export function createNodeAuthorityTransport(wss: WebSocketServer): AuthorityTransport {
  const connections = new Map<string, ConnectionState>();
  const connectedHandlers = new Set<(connectionId: string) => void>();
  const disconnectedHandlers = new Set<(connectionId: string) => void>();
  const messageHandlers = new Set<
    (connectionId: string, message: ClientToAuthorityMessage) => void
  >();

  function notifyDisconnected(connectionId: string, state: ConnectionState): void {
    if (state.disconnected) return;
    state.disconnected = true;
    if (connections.get(connectionId)?.socket === state.socket) connections.delete(connectionId);

    for (const handler of disconnectedHandlers) {
      try {
        handler(connectionId);
      } catch (error) {
        reportTransportError(error);
      }
    }
  }

  function closeAfterError(connectionId: string, state: ConnectionState, error: unknown): void {
    reportTransportError(error);
    notifyDisconnected(connectionId, state);

    if (
      state.socket.readyState !== WebSocket.OPEN &&
      state.socket.readyState !== WebSocket.CONNECTING
    ) {
      return;
    }

    try {
      state.socket.close();
    } catch (closeError) {
      reportTransportError(closeError);
    }
  }

  wss.on('error', reportTransportError);
  wss.on('connection', (socket) => {
    const connectionId = randomUUID();
    const state: ConnectionState = { socket, disconnected: false };
    connections.set(connectionId, state);

    socket.on('message', (data) => {
      if (state.disconnected) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDataToString(data)) as unknown;
        if (!isClientToAuthorityMessage(parsed)) return;
      } catch (error) {
        reportTransportError(error);
        return;
      }

      for (const handler of messageHandlers) {
        try {
          handler(connectionId, parsed);
        } catch (error) {
          reportTransportError(error);
        }
      }
    });

    socket.on('close', () => {
      notifyDisconnected(connectionId, state);
    });

    socket.on('error', (error) => {
      closeAfterError(connectionId, state, error);
    });

    for (const handler of connectedHandlers) {
      try {
        handler(connectionId);
      } catch (error) {
        reportTransportError(error);
      }
    }
  });

  function sendToClient(connectionId: string, message: AuthorityToClientMessage): void {
    const state = connections.get(connectionId);
    if (state === undefined || state.disconnected) return;
    if (state.socket.readyState !== WebSocket.OPEN) return;

    let serialized: string;
    try {
      serialized = JSON.stringify(message);
    } catch (error) {
      reportTransportError(error);
      return;
    }

    if (state.disconnected || state.socket.readyState !== WebSocket.OPEN) return;
    try {
      state.socket.send(serialized);
    } catch (error) {
      reportTransportError(error);
    }
  }

  function broadcast(message: AuthorityToClientMessage): void {
    for (const connectionId of connections.keys()) {
      try {
        sendToClient(connectionId, message);
      } catch (error) {
        reportTransportError(error);
      }
    }
  }

  return {
    sendToClient,

    broadcast,

    disconnectClient(connectionId) {
      const state = connections.get(connectionId);
      if (state === undefined || state.disconnected) return;
      if (state.socket.readyState === WebSocket.CLOSED) {
        notifyDisconnected(connectionId, state);
        return;
      }

      try {
        state.socket.close();
      } catch (error) {
        reportTransportError(error);
        notifyDisconnected(connectionId, state);
      }
    },

    onClientConnected(handler) {
      connectedHandlers.add(handler);
      return () => {
        connectedHandlers.delete(handler);
      };
    },

    onClientDisconnected(handler) {
      disconnectedHandlers.add(handler);
      return () => {
        disconnectedHandlers.delete(handler);
      };
    },

    onMessage(handler) {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
  };
}
