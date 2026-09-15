import type { AuthorityToClientMessage, ClientToAuthorityMessage } from './protocol';

export interface AuthorityTransport {
  sendToClient(connectionId: string, msg: AuthorityToClientMessage): void;
  broadcast(msg: AuthorityToClientMessage): void;
  disconnectClient(connectionId: string): void;
  onClientConnected(handler: (connectionId: string) => void): () => void;
  onClientDisconnected(handler: (connectionId: string) => void): () => void;
  onMessage(handler: (connectionId: string, msg: ClientToAuthorityMessage) => void): () => void;
}
