import {
  isAuthorityToClientMessage,
  type AuthorityToClientMessage,
  type ClientToAuthorityMessage,
} from './protocol';

export interface ClientTransport {
  sendToAuthority(msg: ClientToAuthorityMessage): void;
  onMessage(handler: (msg: AuthorityToClientMessage) => void): () => void;
  onDisconnected(handler: () => void): () => void;
}

function reportTransportError(error: unknown): void {
  console.error('Client transport message handling failed', error);
}

export function createWebSocketClientTransport(url: string): ClientTransport {
  const socket = new WebSocket(url);
  const messageHandlers = new Set<(message: AuthorityToClientMessage) => void>();
  const disconnectedHandlers = new Set<() => void>();
  const pendingMessages: string[] = [];
  let disconnected = false;

  function notifyDisconnected(): void {
    if (disconnected) return;
    disconnected = true;
    pendingMessages.length = 0;
    for (const handler of disconnectedHandlers) {
      try {
        handler();
      } catch (error) {
        reportTransportError(error);
      }
    }
  }

  socket.addEventListener('open', () => {
    while (socket.readyState === WebSocket.OPEN && pendingMessages.length > 0) {
      const message = pendingMessages.shift();
      if (message === undefined) continue;
      try {
        socket.send(message);
      } catch (error) {
        reportTransportError(error);
      }
    }
  });

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data) as unknown;
    } catch (error) {
      reportTransportError(error);
      return;
    }
    if (!isAuthorityToClientMessage(parsed)) return;

    for (const handler of messageHandlers) {
      try {
        handler(parsed);
      } catch (error) {
        reportTransportError(error);
      }
    }
  });

  socket.addEventListener('close', notifyDisconnected);

  return {
    sendToAuthority(message) {
      if (disconnected) return;

      let serialized: string;
      try {
        serialized = JSON.stringify(message);
      } catch (error) {
        reportTransportError(error);
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(serialized);
        } catch (error) {
          reportTransportError(error);
        }
        return;
      }

      if (socket.readyState === WebSocket.CONNECTING) pendingMessages.push(serialized);
    },

    onMessage(handler) {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },

    onDisconnected(handler) {
      disconnectedHandlers.add(handler);
      return () => {
        disconnectedHandlers.delete(handler);
      };
    },
  };
}
