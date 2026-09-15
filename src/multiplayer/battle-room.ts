import type { CharacterId } from '../game/config/phase2-player-balance';
import type { BossBattle } from '../game/session/boss-battle';
import type { WasshoiEvent } from '../input/wasshoi/types';
import type {
  ActionMessage,
  AuthorityToClientMessage,
  ClientToAuthorityMessage,
  JoinMessage,
} from './protocol';
import type { AuthorityTransport } from './authority-transport';

export interface BattleRoom {
  /** ゲーム進行のみ。BossBattle.update(deltaSeconds)を呼ぶ。 */
  update(deltaSeconds: number): void;
  /** 現在のBattleSnapshotをSTATEとして配信する。 */
  publishState(): void;
  /** Pay大輔のWasshoiEventを他のプレイヤーへ配送する。 */
  publishWasshoi(fromPlayerId: string, event: WasshoiEvent): void;
}

function reportRoomError(error: unknown): void {
  console.error('Battle room message handling failed', error);
}

export function createBattleRoom(options: {
  readonly battle: BossBattle;
  readonly transport: AuthorityTransport;
  readonly tokenToPlayerId: ReadonlyMap<string, string>;
  readonly playerIdToCharacterId: ReadonlyMap<string, CharacterId>;
}): BattleRoom {
  const { battle, transport, tokenToPlayerId, playerIdToCharacterId } = options;
  const connectionToPlayerId = new Map<string, string>();
  const playerToConnectionId = new Map<string, string>();
  const playerEpoch = new Map<string, number>();
  const lastAcceptedSeq = new Map<string, number>();

  function handleJoin(connectionId: string, message: JoinMessage): void {
    const playerId = tokenToPlayerId.get(message.token);
    if (playerId === undefined) {
      transport.disconnectClient(connectionId);
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
      transport.disconnectClient(previousConnectionId);
    }

    const epoch = (playerEpoch.get(playerId) ?? 0) + 1;
    playerEpoch.set(playerId, epoch);
    lastAcceptedSeq.set(playerId, -1);
    connectionToPlayerId.set(connectionId, playerId);
    playerToConnectionId.set(playerId, connectionId);
    transport.sendToClient(connectionId, { type: 'WELCOME', playerId, epoch });
  }

  function handleAction(connectionId: string, message: ActionMessage): void {
    const playerId = connectionToPlayerId.get(connectionId);
    if (playerId === undefined) return;

    const currentEpoch = playerEpoch.get(playerId);
    if (currentEpoch === undefined || currentEpoch !== message.epoch) return;
    if (!Number.isFinite(message.seq)) return;

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
        return;
      }
      handleAction(connectionId, message);
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
  });

  return {
    update(deltaSeconds) {
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

      try {
        const message: AuthorityToClientMessage = { type: 'STATE', battle: battleSnapshot };
        transport.broadcast(message);
      } catch (error) {
        reportRoomError(error);
      }
    },

    publishWasshoi(fromPlayerId, event) {
      if (playerIdToCharacterId.get(fromPlayerId) !== 'PAY') return;

      for (const [playerId, characterId] of playerIdToCharacterId) {
        if (characterId === 'PAY') continue;
        const connectionId = playerToConnectionId.get(playerId);
        if (connectionId === undefined) continue;

        try {
          transport.sendToClient(connectionId, { type: 'WASSHOI', event });
        } catch (error) {
          reportRoomError(error);
        }
      }
    },
  };
}
