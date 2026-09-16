import type { BattleSnapshot } from '../game/session/boss-battle';
import type { CharacterId } from '../game/config/phase2-player-balance';
import type { GameAction } from '../game/types/game-action';
import type { WasshoiEvent } from '../input/wasshoi/types';
import type { ClientTransport } from './client-transport';
import type { LobbyMessage, RosterMessage, RoomFullMessage, RejectedMessage } from './protocol';

function reportClientError(error: unknown): void {
  console.error('Realtime battle client handler failed', error);
}

export function createRealtimeBattleClient(options: {
  readonly transport: ClientTransport;
  readonly token: string;
  readonly participantId?: string;
}): {
  readonly submit: (action: GameAction) => void;
  readonly selectCharacter: (characterId: CharacterId) => void;
  readonly requestStart: () => void;
  readonly leave?: () => void;
  readonly onWelcome: (
    handler: (info: { playerId: string; participantId?: string; epoch: number }) => void,
  ) => () => void;
  readonly onState: (handler: (battle: BattleSnapshot) => void) => () => void;
  readonly onRoster: (handler: (roster: RosterMessage) => void) => () => void;
  readonly onLobby: (handler: (lobby: LobbyMessage) => void) => () => void;
  readonly onRoomFull: (handler: (message: RoomFullMessage) => void) => () => void;
  readonly onRejected: (handler: (message: RejectedMessage) => void) => () => void;
  readonly onWasshoi: (handler: (event: WasshoiEvent) => void) => () => void;
} {
  const { transport, token, participantId } = options;
  const welcomeHandlers = new Set<
    (info: { playerId: string; participantId?: string; epoch: number }) => void
  >();
  const stateHandlers = new Set<(battle: BattleSnapshot) => void>();
  const rosterHandlers = new Set<(roster: RosterMessage) => void>();
  const lobbyHandlers = new Set<(lobby: LobbyMessage) => void>();
  const roomFullHandlers = new Set<(message: RoomFullMessage) => void>();
  const rejectedHandlers = new Set<(message: RejectedMessage) => void>();
  const wasshoiHandlers = new Set<(event: WasshoiEvent) => void>();
  let connected = true;
  let playerId: string | null = null;
  let epoch: number | null = null;
  let nextSeq = 0;

  transport.onMessage((message) => {
    if (!connected) return;

    if (message.type === 'WELCOME') {
      playerId = 'participantId' in message ? message.participantId : message.playerId;
      epoch = message.epoch;
      nextSeq = 0;
      for (const handler of welcomeHandlers) {
        try {
          handler({
            playerId,
            ...('participantId' in message ? { participantId: message.participantId } : {}),
            epoch: message.epoch,
          });
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    if (message.type === 'STATE') {
      for (const handler of stateHandlers) {
        try {
          handler(message.battle);
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    if (message.type === 'ROSTER') {
      for (const handler of rosterHandlers) {
        try {
          handler(message);
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    if (message.type === 'LOBBY') {
      for (const handler of lobbyHandlers) {
        try {
          handler(message);
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    if (message.type === 'ROOM_FULL') {
      for (const handler of roomFullHandlers) {
        try {
          handler(message);
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    if (message.type === 'REJECTED') {
      for (const handler of rejectedHandlers) {
        try {
          handler(message);
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    if (message.type === 'WASSHOI') {
      for (const handler of wasshoiHandlers) {
        try {
          handler(message.event);
        } catch (error) {
          reportClientError(error);
        }
      }
    }
  });

  transport.onDisconnected(() => {
    connected = false;
    playerId = null;
    epoch = null;
    nextSeq = 0;
  });

  try {
    if (participantId === undefined) {
      transport.sendToAuthority({ type: 'JOIN', token });
    } else {
      transport.sendToAuthority({ type: 'JOIN', token, participantId });
    }
  } catch (error) {
    reportClientError(error);
  }

  return {
    submit(action) {
      if (!connected || playerId === null || epoch === null) return;

      nextSeq += 1;
      try {
        transport.sendToAuthority({ type: 'ACTION', epoch, seq: nextSeq, action });
      } catch (error) {
        // 送信結果が不明なACTIONは再送せず、次のseqへ進む。
        reportClientError(error);
      }
    },

    selectCharacter(characterId) {
      if (!connected || playerId === null) return;
      try {
        transport.sendToAuthority({ type: 'SELECT_CHARACTER', characterId });
      } catch (error) {
        reportClientError(error);
      }
    },

    requestStart() {
      if (!connected || playerId === null) return;
      try {
        transport.sendToAuthority({ type: 'START' });
      } catch (error) {
        reportClientError(error);
      }
    },

    leave() {
      if (!connected || playerId === null) return;
      try {
        transport.sendToAuthority({ type: 'LEAVE' });
      } catch (error) {
        reportClientError(error);
      }
      connected = false;
      playerId = null;
      epoch = null;
      transport.disconnect?.();
    },

    onWelcome(handler) {
      welcomeHandlers.add(handler);
      return () => {
        welcomeHandlers.delete(handler);
      };
    },

    onState(handler) {
      stateHandlers.add(handler);
      return () => {
        stateHandlers.delete(handler);
      };
    },

    onRoster(handler) {
      rosterHandlers.add(handler);
      return () => {
        rosterHandlers.delete(handler);
      };
    },

    onLobby(handler) {
      lobbyHandlers.add(handler);
      return () => {
        lobbyHandlers.delete(handler);
      };
    },

    onRoomFull(handler) {
      roomFullHandlers.add(handler);
      return () => {
        roomFullHandlers.delete(handler);
      };
    },

    onRejected(handler) {
      rejectedHandlers.add(handler);
      return () => {
        rejectedHandlers.delete(handler);
      };
    },

    onWasshoi(handler) {
      wasshoiHandlers.add(handler);
      return () => {
        wasshoiHandlers.delete(handler);
      };
    },
  };
}
