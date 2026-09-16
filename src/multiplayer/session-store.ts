import { create } from 'zustand';

import type { CharacterId } from '../game/config/phase2-player-balance';
import { createWebSocketClientTransport } from './client-transport';
import type {
  LobbyMessage,
  RejectedMessage,
  RejectionReason,
  RoomFullMessage,
  RosterMessage,
} from './protocol';
import { isOpaqueParticipantId } from './protocol';
import { createRealtimeBattleClient } from './realtime-battle-client';

/**
 * `NO_TOKEN` はtoken方式廃止後も互換のため残した名前だが、実際は
 * 「まだconnect()を試みていない」初期状態を指すだけで、tokenの有無とは
 * 無関係("token方式を廃止"を参照)。connect()を呼べば(tokenが無くても)
 * 必ずCONNECTINGへ進む。
 */
export type ConnectionStatus =
  | 'NO_TOKEN'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'FULL'
  | 'REJECTED'
  | 'DISCONNECTED';
export type SessionPhase = 'MATCHING' | 'STARTED';

type RealtimeBattleClient = ReturnType<typeof createRealtimeBattleClient>;

export const PARTICIPANT_STORAGE_KEY = 'nelda.participantId';

interface MultiplayerSessionStore {
  token: string | null;
  participantId: string | null;
  status: ConnectionStatus;
  client: RealtimeBattleClient | null;
  /** #47 互換。新画面はlobbyを読む。 */
  localPlayerId: string | null;
  roster: RosterMessage | null;
  lobby: LobbyMessage | null;
  fullRoom: RoomFullMessage | null;
  phase: SessionPhase;
  rejected: RejectedMessage | null;
  connect: () => void;
  selectCharacter: (characterId: CharacterId) => void;
  requestStart: () => void;
  leave: () => void;
}

function reportSessionError(error: unknown): void {
  console.error('Multiplayer session connection failed', error);
}

function createParticipantId(): string {
  const cryptoObject = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObject?.randomUUID !== undefined) return `participant-${cryptoObject.randomUUID()}`;
  const random = Math.random().toString(36).slice(2);
  return `participant-${Date.now().toString(36)}-${random}`;
}

export function readOrCreateParticipantId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.sessionStorage.getItem(PARTICIPANT_STORAGE_KEY);
    if (isOpaqueParticipantId(stored)) return stored;
    const participantId = createParticipantId();
    window.sessionStorage.setItem(PARTICIPANT_STORAGE_KEY, participantId);
    return participantId;
  } catch (error) {
    reportSessionError(error);
    // sessionStorageが無効な環境でも接続は試せる。再読込時の再接続性だけ失う。
    return createParticipantId();
  }
}

function tokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.search).get('token');
  return token === null || token === '' ? null : token;
}

/**
 * URLに `?token=` が無いとき(通常の同一URL導線)に送る既定値。
 *
 * Authority側は NELDA_ROOM_TOKEN が未設定ならtokenの値自体を検証しない
 * ため、これは秘密ではなく「何か非空文字列を送る」というprotocol形状を
 * 満たすためだけのプレースホルダ。デプロイ側が NELDA_ROOM_TOKEN を設定して
 * 参加を絞りたい場合は、共有リンクに `?token=...` を付けて配る。
 */
const OPEN_ROOM_TOKEN = 'public';

export const useMultiplayerSessionStore = create<MultiplayerSessionStore>((set, get) => {
  const initialToken = tokenFromLocation();
  let connectionGeneration = 0;

  function isCurrent(generation: number): boolean {
    return generation === connectionGeneration;
  }

  function resetConnectionState(status: ConnectionStatus): void {
    set({
      status,
      client: null,
      localPlayerId: null,
      lobby: null,
      roster: null,
      fullRoom: null,
      phase: 'MATCHING',
      rejected: null,
    });
  }

  return {
    token: initialToken,
    participantId: readOrCreateParticipantId(),
    status: 'NO_TOKEN',
    client: null,
    localPlayerId: null,
    roster: null,
    lobby: null,
    fullRoom: null,
    phase: 'MATCHING',
    rejected: null,

    connect: () => {
      const { status, token } = get();
      if (
        status === 'CONNECTING' ||
        status === 'CONNECTED' ||
        status === 'FULL' ||
        status === 'REJECTED'
      ) {
        return;
      }
      // token方式は廃止済み: ?token= が無い通常導線でもそのまま接続する。
      // URLにtokenがあれば(絞り込み運用のデプロイ向けに)そのまま使う。
      const effectiveToken = token ?? OPEN_ROOM_TOKEN;

      const participantId = get().participantId ?? readOrCreateParticipantId();
      if (participantId === null) {
        set({ status: 'DISCONNECTED' });
        return;
      }
      const generation = connectionGeneration + 1;
      connectionGeneration = generation;
      set({
        status: 'CONNECTING',
        participantId,
        client: null,
        localPlayerId: null,
        roster: null,
        lobby: null,
        fullRoom: null,
        phase: 'MATCHING',
        rejected: null,
      });

      try {
        const authorityUrl = import.meta.env.VITE_AUTHORITY_WS_URL || 'ws://localhost:3000';
        const transport = createWebSocketClientTransport(authorityUrl);
        const client = createRealtimeBattleClient({
          transport,
          token: effectiveToken,
          participantId,
        });

        client.onWelcome(({ playerId }) => {
          if (!isCurrent(generation)) return;
          set({ status: 'CONNECTED', localPlayerId: playerId });
        });
        client.onLobby?.((lobby) => {
          if (!isCurrent(generation)) return;
          set({
            status: lobby.full ? 'FULL' : 'CONNECTED',
            lobby,
            fullRoom: null,
            phase: lobby.started ? 'STARTED' : 'MATCHING',
            rejected: null,
          });
        });
        client.onRoster?.((roster) => {
          if (!isCurrent(generation)) return;
          set({
            roster,
            phase: roster.started ? 'STARTED' : 'MATCHING',
          });
        });
        client.onRoomFull?.((fullRoom) => {
          if (!isCurrent(generation)) return;
          set({ status: 'FULL', fullRoom, lobby: null, phase: 'MATCHING' });
        });
        client.onRejected?.((rejected) => {
          if (!isCurrent(generation)) return;
          const transient =
            rejected.reason === 'ROLE_TAKEN' ||
            rejected.reason === 'ROLE_LOCKED' ||
            rejected.reason === 'START_NOT_ALLOWED';
          set({
            status: transient ? 'CONNECTED' : 'REJECTED',
            rejected,
            ...(transient ? {} : { client: null }),
          });
        });
        transport.onDisconnected(() => {
          if (!isCurrent(generation)) return;
          if (get().status === 'REJECTED') return;
          resetConnectionState('DISCONNECTED');
        });
        set({ client });
      } catch (error) {
        reportSessionError(error);
        resetConnectionState('DISCONNECTED');
      }
    },

    selectCharacter: (characterId) => {
      const client = get().client;
      if (get().status !== 'CONNECTED' || client === null) return;
      client.selectCharacter(characterId);
    },

    requestStart: () => {
      const client = get().client;
      if (get().status !== 'CONNECTED' || client === null) return;
      client.requestStart();
    },

    leave: () => {
      connectionGeneration += 1;
      get().client?.leave?.();
      resetConnectionState('NO_TOKEN');
    },
  };
});

export type { RejectionReason };
