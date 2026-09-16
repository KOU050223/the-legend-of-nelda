import type { LobbyMessage } from '@/multiplayer/protocol';

import type { LiveKitTokenRequest, VoiceRole } from './livekit-voice-session';

/**
 * Phase 2 の Authority は現在1つの3人用 Battle Room だけを持つ。
 * 複数Room対応時は Authority が配信する session ID を `authorityRoomId` として渡す。
 */
export const DEFAULT_MULTIPLAYER_VOICE_ROOM_NAME = 'nelda-demo';

export interface MultiplayerVoiceAuthorityState {
  /** WELCOME/JOIN で Authority が受理した、このブラウザの不透明な参加者ID。 */
  readonly participantId: string | null;
  /** Authority が配信するRoleの真実源。クライアント入力のRoleは受け取らない。 */
  readonly lobby: LobbyMessage | null;
  /** 将来の複数Battle Room用。未実装の間はデプロイ設定のRoom名を使う。 */
  readonly authorityRoomId?: string | null;
}

export interface MultiplayerVoiceContext {
  readonly roomName: string;
  readonly participantIdentity: string;
  readonly role: VoiceRole;
}

/**
 * LiveKit用の公開Room名。これはAPI Secretではない。
 * 本番ではAuthority Sessionと1対1になる値をデプロイごとに設定する。
 */
export function configuredMultiplayerVoiceRoomName(
  configuredRoomName: string | undefined = import.meta.env.VITE_LIVEKIT_ROOM_NAME,
): string {
  const roomName = configuredRoomName?.trim();
  return roomName === undefined || roomName === '' ? DEFAULT_MULTIPLAYER_VOICE_ROOM_NAME : roomName;
}

function voiceRoleFor(role: LobbyMessage['slots'][number]['role']): VoiceRole | null {
  if (role === 'ODORUNO' || role === 'PAY' || role === 'ORA') return role;
  return null;
}

/**
 * Voice用identity/roleをAuthorityの現在のLobbyからだけ解決する。
 * Role未選択・切断済み・満員者にはVoice接続情報を渡さない。
 */
export function resolveMultiplayerVoiceContext(
  state: MultiplayerVoiceAuthorityState,
  fallbackRoomName: string = configuredMultiplayerVoiceRoomName(),
): MultiplayerVoiceContext | null {
  if (state.participantId === null || state.lobby === null) return null;

  const localSlot = state.lobby.slots.find(
    (slot) => slot.participantId === state.participantId && slot.connected,
  );
  const role = voiceRoleFor(localSlot?.role ?? null);
  if (role === null) return null;

  const authorityRoomId = state.authorityRoomId?.trim();
  return {
    roomName:
      authorityRoomId === undefined || authorityRoomId === '' ? fallbackRoomName : authorityRoomId,
    participantIdentity: state.participantId,
    role,
  };
}

/** 接続時に既存の requestLiveKitCredentials() へ渡す値を一箇所で作る。 */
export function liveKitTokenRequestFor(context: MultiplayerVoiceContext): LiveKitTokenRequest {
  return {
    roomName: context.roomName,
    playerId: context.participantIdentity,
    role: context.role,
  };
}

/**
 * App/Multiplayer Session寿命のVoice Controllerの最小骨組み。
 * Phase 2でここへLiveKit Roomの生成・接続を追加し、MATCHING/GAMEのComponentからは
 * Roomを所有しない。現段階ではAuthority stateとVoice contextの同期だけを担う。
 */
export interface MultiplayerVoiceSessionController {
  sync(state: MultiplayerVoiceAuthorityState): MultiplayerVoiceContext | null;
  context(): MultiplayerVoiceContext | null;
  clear(): void;
}

export function createMultiplayerVoiceSessionController(
  fallbackRoomName: string = configuredMultiplayerVoiceRoomName(),
): MultiplayerVoiceSessionController {
  let currentContext: MultiplayerVoiceContext | null = null;

  return {
    sync(state) {
      currentContext = resolveMultiplayerVoiceContext(state, fallbackRoomName);
      return currentContext;
    },
    context() {
      return currentContext;
    },
    clear() {
      currentContext = null;
    },
  };
}
