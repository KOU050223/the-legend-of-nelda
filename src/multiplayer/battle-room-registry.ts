import type { CharacterId } from '../game/config/phase2-player-balance';
import type { BossBattle } from '../game/session/boss-battle';
import type { WasshoiEvent } from '../input/wasshoi/types';
import type { AuthorityTransport } from './authority-transport';
import { createBattleRoom, type BattleRoom } from './battle-room';
import type { AuthorityToClientMessage, ClientToAuthorityMessage, JoinMessage } from './protocol';

export interface BattleRoomRegistryOptions {
  readonly transport: AuthorityTransport;
  /** 共有リンク用tokenから、サーバー内のroom idを解決する。 */
  readonly tokenToRoomId?: ReadonlyMap<string, string>;
  /** #47互換。指定時は従来どおり全tokenを1つのroomへ入れる。 */
  readonly tokenToPlayerId?: ReadonlyMap<string, string>;
  readonly roomToken?: string;
  readonly createBattle: (roles: ReadonlyMap<string, CharacterId>) => BossBattle;
}

type MessageHandler = (connectionId: string, message: ClientToAuthorityMessage) => void;
type DisconnectHandler = (connectionId: string) => void;

/**
 * 1つのWebSocket transportをroomごとの仮想transportへ分割する。
 * BattleRoomは従来どおりconnectionIdしか意識せず、他roomへの配信はここで遮断する。
 */
class ScopedAuthorityTransport implements AuthorityTransport {
  private readonly connectionIds = new Set<string>();
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly disconnectedHandlers = new Set<DisconnectHandler>();

  constructor(private readonly transport: AuthorityTransport) {}

  addConnection(connectionId: string): void {
    this.connectionIds.add(connectionId);
  }

  deliverMessage(connectionId: string, message: ClientToAuthorityMessage): void {
    for (const handler of this.messageHandlers) handler(connectionId, message);
  }

  deliverDisconnected(connectionId: string): void {
    if (!this.connectionIds.delete(connectionId)) return;
    for (const handler of this.disconnectedHandlers) handler(connectionId);
  }

  sendToClient(connectionId: string, message: AuthorityToClientMessage): void {
    if (this.connectionIds.has(connectionId)) this.transport.sendToClient(connectionId, message);
  }

  broadcast(message: AuthorityToClientMessage): void {
    for (const connectionId of this.connectionIds)
      this.transport.sendToClient(connectionId, message);
  }

  disconnectClient(connectionId: string): void {
    this.transport.disconnectClient(connectionId);
  }

  onClientConnected(): () => void {
    return () => undefined;
  }

  onClientDisconnected(handler: DisconnectHandler): () => void {
    this.disconnectedHandlers.add(handler);
    return () => this.disconnectedHandlers.delete(handler);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
}

interface RoomEntry {
  readonly room: BattleRoom;
  readonly transport: ScopedAuthorityTransport;
}

interface ParticipantOwner {
  readonly room: RoomEntry;
  timer: ReturnType<typeof setTimeout> | null;
}

const RECONNECT_GRACE_MS = 30_000;

/**
 * tokenでroomを決め、roomごとに独立したlobby / BossBattleを所有するAuthority。
 * tokenToRoomId未指定の公開運用ではtoken自体をroom idとして使うため、共有URLの
 * `?token=` を変えるだけで別sessionになる。
 */
export function createBattleRoomRegistry(options: BattleRoomRegistryOptions): BattleRoom {
  const rooms = new Map<string, RoomEntry>();
  const connectionRooms = new Map<string, RoomEntry>();
  const connectionParticipants = new Map<string, string>();
  const participantOwners = new Map<string, ParticipantOwner>();
  const legacySingleRoom = options.tokenToPlayerId !== undefined;

  function roomIdFor(message: JoinMessage): string {
    if (options.tokenToRoomId !== undefined)
      return options.tokenToRoomId.get(message.token) ?? '__invalid__';
    if (legacySingleRoom || options.roomToken !== undefined) return '__default__';
    return message.token;
  }

  function roomOptions(roomId: string) {
    if (options.tokenToRoomId !== undefined) {
      const tokenToRoomId = new Map<string, string>();
      for (const [token, mappedRoomId] of options.tokenToRoomId) {
        if (mappedRoomId === roomId) tokenToRoomId.set(token, mappedRoomId);
      }
      return { tokenToRoomId };
    }
    if (legacySingleRoom) return { tokenToPlayerId: options.tokenToPlayerId };
    if (options.roomToken !== undefined) return { roomToken: options.roomToken };
    return {};
  }

  function entryFor(roomId: string): RoomEntry {
    const existing = rooms.get(roomId);
    if (existing !== undefined) return existing;

    const transport = new ScopedAuthorityTransport(options.transport);
    const entry = {
      transport,
      room: createBattleRoom({
        transport,
        ...roomOptions(roomId),
        createBattle: options.createBattle,
      }),
    };
    rooms.set(roomId, entry);
    return entry;
  }

  options.transport.onMessage((connectionId, message) => {
    let entry = connectionRooms.get(connectionId);
    if (entry === undefined && message.type === 'JOIN') {
      entry = entryFor(roomIdFor(message));
      const participantId = message.participantId;
      if (participantId !== undefined) {
        const previousOwner = participantOwners.get(participantId);
        if (previousOwner !== undefined && previousOwner.room !== entry) {
          if (previousOwner.timer !== null) clearTimeout(previousOwner.timer);
          previousOwner.room.room.removeParticipant(participantId);
        }
        const owner = participantOwners.get(participantId);
        if (owner !== undefined && owner.timer !== null) clearTimeout(owner.timer);
        participantOwners.set(participantId, { room: entry, timer: null });
        connectionParticipants.set(connectionId, participantId);
      }
      connectionRooms.set(connectionId, entry);
      entry.transport.addConnection(connectionId);
    }
    entry?.transport.deliverMessage(connectionId, message);
  });

  options.transport.onClientDisconnected((connectionId) => {
    const entry = connectionRooms.get(connectionId);
    const participantId = connectionParticipants.get(connectionId);
    connectionRooms.delete(connectionId);
    connectionParticipants.delete(connectionId);
    entry?.transport.deliverDisconnected(connectionId);
    if (entry === undefined || participantId === undefined) return;

    const owner = participantOwners.get(participantId);
    if (owner === undefined || owner.room !== entry) return;
    owner.timer = setTimeout(() => {
      const currentOwner = participantOwners.get(participantId);
      if (currentOwner !== owner) return;
      participantOwners.delete(participantId);
      entry.room.removeParticipant(participantId);
    }, RECONNECT_GRACE_MS);
    if (typeof owner.timer !== 'number') owner.timer.unref?.();
  });

  return {
    update(deltaSeconds) {
      for (const { room } of rooms.values()) room.update(deltaSeconds);
    },
    publishState() {
      for (const { room } of rooms.values()) room.publishState();
    },
    publishWasshoi(fromParticipantId: string, event: WasshoiEvent) {
      for (const { room } of rooms.values()) room.publishWasshoi(fromParticipantId, event);
    },
    removeParticipant(participantId: string) {
      const owner = participantOwners.get(participantId);
      if (owner === undefined) return;
      if (owner.timer !== null) clearTimeout(owner.timer);
      participantOwners.delete(participantId);
      owner.room.room.removeParticipant(participantId);
    },
  };
}
