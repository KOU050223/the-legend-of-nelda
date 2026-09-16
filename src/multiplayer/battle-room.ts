import type { CharacterId } from '../game/config/phase2-player-balance';
import type { BossBattle } from '../game/session/boss-battle';
import type { WasshoiEvent } from '../input/wasshoi/types';
import type { AuthorityTransport } from './authority-transport';
import type {
  ActionMessage,
  AuthorityToClientMessage,
  ClientToAuthorityMessage,
  JoinMessage,
  LobbyMessage,
  LobbySlot,
  RejectionReason,
  SelectCharacterMessage,
  StartMessage,
} from './protocol';
import { isOpaqueParticipantId } from './protocol';

const MAX_PARTICIPANTS = 3;

export interface BattleRoom {
  /** ゲーム進行のみ。開始後にBossBattle.update(deltaSeconds)を呼ぶ。 */
  update(deltaSeconds: number): void;
  /** 開始後のBattleSnapshotだけをSTATEとして配信する。 */
  publishState(): void;
  /** Pay大輔のWasshoiEventを他のプレイヤーへ配送する。 */
  publishWasshoi(fromParticipantId: string, event: WasshoiEvent): void;
  /** participantが別roomへ移動・再接続猶予切れした時、server側から退出させる。 */
  removeParticipant(participantId: string): void;
}

export interface LegacyBattleRoomOptions {
  readonly battle: BossBattle;
  readonly transport: AuthorityTransport;
  readonly tokenToPlayerId: ReadonlyMap<string, string>;
  readonly playerIdToCharacterId: ReadonlyMap<string, CharacterId>;
}

export interface LobbyBattleRoomOptions {
  readonly transport: AuthorityTransport;
  /** 共有room token→room id。単一room serverではkeyだけを認証に使う。 */
  readonly tokenToRoomId?: ReadonlyMap<string, string>;
  /** 旧server wiringとの互換。新modeではkeyを共有tokenとして扱う。 */
  readonly tokenToPlayerId?: ReadonlyMap<string, string>;
  readonly roomToken?: string;
  /** STARTを受理した一度だけ、凍結済みrole mappingから呼ぶ。 */
  readonly createBattle?: (roles: ReadonlyMap<string, CharacterId>) => BossBattle;
  readonly battleFactory?: (roles: ReadonlyMap<string, CharacterId>) => BossBattle;
}

export type BattleRoomOptions = LegacyBattleRoomOptions | LobbyBattleRoomOptions;

function reportRoomError(error: unknown): void {
  console.error('Battle room message handling failed', error);
}

function sendSafely(
  transport: AuthorityTransport,
  connectionId: string,
  message: AuthorityToClientMessage,
): void {
  try {
    transport.sendToClient(connectionId, message);
  } catch (error) {
    reportRoomError(error);
  }
}

function broadcastSafely(transport: AuthorityTransport, message: AuthorityToClientMessage): void {
  try {
    transport.broadcast(message);
  } catch (error) {
    reportRoomError(error);
  }
}

function isLegacyOptions(options: BattleRoomOptions): options is LegacyBattleRoomOptions {
  return 'battle' in options && options.battle !== undefined && 'playerIdToCharacterId' in options;
}

/**
 * #47で導入された固定token/player wiring。既存の単体fixtureを壊さず残すが、
 * Issue #92の本番serverはこの経路を使わず、下のanonymous lobby modeを使う。
 */
function createLegacyBattleRoom(options: LegacyBattleRoomOptions): BattleRoom {
  const { battle, transport, tokenToPlayerId, playerIdToCharacterId } = options;
  const connectionToPlayerId = new Map<string, string>();
  const playerToConnectionId = new Map<string, string>();
  const playerEpoch = new Map<string, number>();
  const lastAcceptedSeq = new Map<string, number>();
  let started = false;

  function publishRoster(): void {
    if (!started && playerToConnectionId.size >= playerIdToCharacterId.size) {
      started = true;
    }

    const slots = [...playerIdToCharacterId].map(([playerId, characterId]) => ({
      playerId,
      characterId,
      connected: playerToConnectionId.has(playerId),
    }));

    broadcastSafely(transport, { type: 'ROSTER', slots, started });
  }

  function handleJoin(connectionId: string, message: JoinMessage): void {
    const playerId = tokenToPlayerId.get(message.token);
    if (playerId === undefined) {
      try {
        transport.disconnectClient(connectionId);
      } catch (error) {
        reportRoomError(error);
      }
      return;
    }

    const previousPlayerId = connectionToPlayerId.get(connectionId);
    if (
      previousPlayerId !== undefined &&
      previousPlayerId !== playerId &&
      playerToConnectionId.get(previousPlayerId) === connectionId
    ) {
      playerToConnectionId.delete(previousPlayerId);
    }

    const previousConnectionId = playerToConnectionId.get(playerId);
    if (previousConnectionId !== undefined && previousConnectionId !== connectionId) {
      try {
        transport.disconnectClient(previousConnectionId);
      } catch (error) {
        reportRoomError(error);
      }
    }

    const epoch = (playerEpoch.get(playerId) ?? 0) + 1;
    playerEpoch.set(playerId, epoch);
    lastAcceptedSeq.set(playerId, -1);
    connectionToPlayerId.set(connectionId, playerId);
    playerToConnectionId.set(playerId, connectionId);
    sendSafely(transport, connectionId, { type: 'WELCOME', playerId, epoch });
    publishRoster();
  }

  function handleAction(connectionId: string, message: ActionMessage): void {
    const playerId = connectionToPlayerId.get(connectionId);
    if (playerId === undefined) return;

    const currentEpoch = playerEpoch.get(playerId);
    if (currentEpoch === undefined || currentEpoch !== message.epoch) return;
    const previousSeq = lastAcceptedSeq.get(playerId) ?? -1;
    if (message.seq <= previousSeq) return;

    // 例外が出ても同じseqを繰り返し実行しないよう、submitより先に記録する。
    lastAcceptedSeq.set(playerId, message.seq);
    battle.submit(playerId, message.action);
  }

  function handleMessage(connectionId: string, message: ClientToAuthorityMessage): void {
    try {
      if (message.type === 'JOIN') {
        handleJoin(connectionId, message);
      } else if (message.type === 'ACTION') {
        handleAction(connectionId, message);
      }
    } catch (error) {
      reportRoomError(error);
    }
  }

  transport.onMessage(handleMessage);

  transport.onClientDisconnected((connectionId) => {
    const playerId = connectionToPlayerId.get(connectionId);
    if (playerId === undefined) return;

    connectionToPlayerId.delete(connectionId);
    if (playerToConnectionId.get(playerId) === connectionId) {
      playerToConnectionId.delete(playerId);
    }
    publishRoster();
  });

  return {
    update(deltaSeconds) {
      if (!started) return;

      try {
        battle.update(deltaSeconds);
      } catch (error) {
        reportRoomError(error);
      }
    },

    publishState() {
      let battleSnapshot;
      try {
        battleSnapshot = battle.snapshot();
      } catch (error) {
        reportRoomError(error);
        return;
      }

      broadcastSafely(transport, { type: 'STATE', battle: battleSnapshot });
    },

    publishWasshoi(fromPlayerId, event) {
      if (playerIdToCharacterId.get(fromPlayerId) !== 'PAY') return;

      for (const [playerId, characterId] of playerIdToCharacterId) {
        if (characterId === 'PAY') continue;
        const connectionId = playerToConnectionId.get(playerId);
        if (connectionId === undefined) continue;
        sendSafely(transport, connectionId, { type: 'WASSHOI', event });
      }
    },

    removeParticipant() {
      // Legacy modeは固定player rosterのため、room registryからは使わない。
    },
  };
}

interface ParticipantState {
  readonly participantId: string;
  role: CharacterId | null;
  connectionId: string | null;
}

interface ConnectionState {
  readonly participantId: string | null;
  readonly full: boolean;
}

function reject(
  transport: AuthorityTransport,
  connectionId: string,
  reason: RejectionReason,
): void {
  sendSafely(transport, connectionId, { type: 'REJECTED', reason });
}

function createLobbySlots(participants: readonly ParticipantState[]): LobbySlot[] {
  return [0, 1, 2].map((index) => {
    const participant = participants[index];
    return participant === undefined
      ? { participantId: null, role: null, connected: false }
      : {
          participantId: participant.participantId,
          role: participant.role,
          connected: participant.connectionId !== null,
        };
  });
}

function createAnonymousBattleRoom(options: LobbyBattleRoomOptions): BattleRoom {
  const { transport } = options;
  const authorizedTokens = new Set<string>();
  for (const token of options.tokenToRoomId?.keys() ?? []) authorizedTokens.add(token);
  for (const token of options.tokenToPlayerId?.keys() ?? []) authorizedTokens.add(token);
  if (options.roomToken !== undefined) authorizedTokens.add(options.roomToken);

  const participants: ParticipantState[] = [];
  const participantById = new Map<string, ParticipantState>();
  const connectionStates = new Map<string, ConnectionState>();
  const connectionToParticipant = new Map<string, string>();
  const epochs = new Map<string, number>();
  const lastAcceptedSeq = new Map<string, number>();
  let started = false;
  let frozenRoles: ReadonlyMap<string, CharacterId> | null = null;
  let battle: BossBattle | null = null;

  function publishLobby(): void {
    const slots = createLobbySlots(participants);
    const lobby: LobbyMessage = { type: 'LOBBY', slots, started, full: false };
    for (const [connectionId, state] of connectionStates) {
      if (state.full) {
        sendSafely(transport, connectionId, { type: 'ROOM_FULL', slots, started });
      } else {
        sendSafely(transport, connectionId, lobby);
      }
    }
  }

  function attachConnection(connectionId: string, participant: ParticipantState): void {
    const previousConnection = participant.connectionId;
    if (previousConnection !== null && previousConnection !== connectionId) {
      try {
        transport.disconnectClient(previousConnection);
      } catch (error) {
        reportRoomError(error);
      }
      connectionStates.delete(previousConnection);
      connectionToParticipant.delete(previousConnection);
    }

    const epoch = (epochs.get(participant.participantId) ?? 0) + 1;
    epochs.set(participant.participantId, epoch);
    lastAcceptedSeq.set(participant.participantId, -1);
    participant.connectionId = connectionId;
    connectionStates.set(connectionId, { participantId: participant.participantId, full: false });
    connectionToParticipant.set(connectionId, participant.participantId);
    sendSafely(transport, connectionId, {
      type: 'WELCOME',
      participantId: participant.participantId,
      epoch,
    });
  }

  function handleJoin(connectionId: string, message: JoinMessage): void {
    // authorizedTokensが空 = NELDA_ROOM_TOKEN等が何も設定されていない
    // (デフォルト)。このプロダクトは3人固定・デモ用途・認証なしが前提
    // なので、その場合はtokenの値自体を検証せず誰でもJOINできる。
    // 何か1つでも設定されていれば、従来どおりホワイトリスト照合する。
    if (authorizedTokens.size > 0 && !authorizedTokens.has(message.token)) {
      reject(transport, connectionId, 'INVALID_TOKEN');
      try {
        transport.disconnectClient(connectionId);
      } catch (error) {
        reportRoomError(error);
      }
      return;
    }

    const participantId = message.participantId;
    if (participantId === undefined || !isOpaqueParticipantId(participantId)) {
      reject(transport, connectionId, 'INVALID_PARTICIPANT');
      return;
    }

    const previousParticipantId = connectionToParticipant.get(connectionId);
    if (previousParticipantId !== undefined && previousParticipantId !== participantId) {
      const previous = participantById.get(previousParticipantId);
      if (previous?.connectionId === connectionId) previous.connectionId = null;
      connectionToParticipant.delete(connectionId);
      connectionStates.delete(connectionId);
      if (!started && previous !== undefined) {
        participantById.delete(previousParticipantId);
        const index = participants.indexOf(previous);
        if (index >= 0) participants.splice(index, 1);
      }
    }

    let participant = participantById.get(participantId);
    if (participant === undefined) {
      if (started || participants.length >= MAX_PARTICIPANTS) {
        connectionStates.set(connectionId, { participantId: null, full: true });
        sendSafely(transport, connectionId, {
          type: 'ROOM_FULL',
          slots: createLobbySlots(participants),
          started,
        });
        return;
      }
      participant = { participantId, role: null, connectionId: null };
      participants.push(participant);
      participantById.set(participantId, participant);
    }

    attachConnection(connectionId, participant);
    publishLobby();
  }

  function participantForConnection(connectionId: string): ParticipantState | undefined {
    const participantId = connectionToParticipant.get(connectionId);
    return participantId === undefined ? undefined : participantById.get(participantId);
  }

  function removeParticipant(participantId: string): void {
    const participant = participantById.get(participantId);
    if (participant === undefined) return;

    if (participant.connectionId !== null) {
      connectionToParticipant.delete(participant.connectionId);
      const state = connectionStates.get(participant.connectionId);
      if (state !== undefined) {
        connectionStates.set(participant.connectionId, { participantId: null, full: true });
      }
    }
    participantById.delete(participantId);
    epochs.delete(participantId);
    lastAcceptedSeq.delete(participantId);
    const index = participants.indexOf(participant);
    if (index >= 0) participants.splice(index, 1);

    // 開始済みbattleから1人だけを安全に取り除くAPIは無いため、残った参加者を
    // MATCHINGへ戻して新しい3人でbattleを作り直す。幽霊playerを残さない。
    if (started) {
      started = false;
      frozenRoles = null;
      battle = null;
    }
    publishLobby();
  }

  function handleSelectCharacter(connectionId: string, message: SelectCharacterMessage): void {
    const participant = participantForConnection(connectionId);
    if (participant === undefined) {
      reject(transport, connectionId, 'NOT_JOINED');
      return;
    }
    if (started) {
      reject(transport, connectionId, 'ROLE_LOCKED');
      return;
    }

    const taken = participants.some(
      (candidate) => candidate !== participant && candidate.role === message.characterId,
    );
    if (taken) {
      reject(transport, connectionId, 'ROLE_TAKEN');
      return;
    }

    participant.role = message.characterId;
    publishLobby();
  }

  function handleStart(connectionId: string, _message: StartMessage): void {
    const participant = participantForConnection(connectionId);
    if (participant === undefined || started) {
      reject(transport, connectionId, 'START_NOT_ALLOWED');
      return;
    }

    const roles = participants.map((candidate) => candidate.role);
    const allConnected =
      participants.length === MAX_PARTICIPANTS &&
      participants.every((candidate) => candidate.connectionId !== null);
    const allRolesFilled = roles.every((role): role is CharacterId => role !== null);
    const hasDistinctRoles = new Set(roles).size === MAX_PARTICIPANTS;
    if (!allConnected || !allRolesFilled || !hasDistinctRoles) {
      reject(transport, connectionId, 'START_NOT_ALLOWED');
      return;
    }

    // JSのイベントループ内ではこの同期区間がatomic。先に凍結し、factoryが
    // 例外を出した場合はstartedへ遷移させず、再試行可能な状態を保つ。
    const nextFrozenRoles = new Map<string, CharacterId>();
    for (const candidate of participants) {
      const role = candidate.role;
      if (role === null) {
        reject(transport, connectionId, 'START_NOT_ALLOWED');
        return;
      }
      nextFrozenRoles.set(candidate.participantId, role);
    }
    const factory = options.createBattle ?? options.battleFactory;
    if (factory === undefined) {
      reject(transport, connectionId, 'START_NOT_ALLOWED');
      return;
    }
    try {
      battle = factory(nextFrozenRoles);
    } catch (error) {
      reportRoomError(error);
      reject(transport, connectionId, 'START_NOT_ALLOWED');
      return;
    }
    frozenRoles = nextFrozenRoles;
    started = true;
    publishLobby();
  }

  function handleAction(connectionId: string, message: ActionMessage): void {
    if (!started || battle === null) return;
    const participant = participantForConnection(connectionId);
    if (participant === undefined) return;
    const currentEpoch = epochs.get(participant.participantId);
    if (currentEpoch === undefined || currentEpoch !== message.epoch) return;
    const previousSeq = lastAcceptedSeq.get(participant.participantId) ?? -1;
    if (message.seq <= previousSeq) return;
    lastAcceptedSeq.set(participant.participantId, message.seq);
    battle.submit(participant.participantId, message.action);
  }

  function handleMessage(connectionId: string, message: ClientToAuthorityMessage): void {
    try {
      if (message.type === 'JOIN') {
        handleJoin(connectionId, message);
      } else if (message.type === 'SELECT_CHARACTER') {
        handleSelectCharacter(connectionId, message);
      } else if (message.type === 'START') {
        handleStart(connectionId, message);
      } else {
        handleAction(connectionId, message);
      }
    } catch (error) {
      reportRoomError(error);
    }
  }

  transport.onMessage(handleMessage);

  transport.onClientDisconnected((connectionId) => {
    const state = connectionStates.get(connectionId);
    connectionStates.delete(connectionId);
    if (state === undefined || state.full || state.participantId === null) return;

    connectionToParticipant.delete(connectionId);
    const participant = participantById.get(state.participantId);
    if (participant?.connectionId !== connectionId) return;
    participant.connectionId = null;
    if (!started) removeParticipant(state.participantId);
    publishLobby();
  });

  return {
    update(deltaSeconds) {
      if (!started || battle === null) return;
      try {
        battle.update(deltaSeconds);
      } catch (error) {
        reportRoomError(error);
      }
    },

    publishState() {
      if (!started || battle === null) return;
      let snapshot;
      try {
        snapshot = battle.snapshot();
      } catch (error) {
        reportRoomError(error);
        return;
      }
      for (const [connectionId, state] of connectionStates) {
        if (state.full || state.participantId === null) continue;
        sendSafely(transport, connectionId, { type: 'STATE', battle: snapshot });
      }
    },

    publishWasshoi(fromParticipantId, event) {
      if (!started || frozenRoles?.get(fromParticipantId) !== 'PAY') return;
      for (const [connectionId, state] of connectionStates) {
        if (state.full || state.participantId === null) continue;
        if (frozenRoles.get(state.participantId) === 'PAY') continue;
        sendSafely(transport, connectionId, { type: 'WASSHOI', event });
      }
    },

    removeParticipant,
  };
}

export function createBattleRoom(options: BattleRoomOptions): BattleRoom {
  return isLegacyOptions(options)
    ? createLegacyBattleRoom(options)
    : createAnonymousBattleRoom(options);
}
