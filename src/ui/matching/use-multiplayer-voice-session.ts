import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LobbyMessage } from '@/multiplayer/protocol';
import {
  liveKitTokenRequestFor,
  resolveMultiplayerVoiceContext,
  type MultiplayerVoiceContext,
} from '@/voice/multiplayer-voice-session';
import {
  createLiveKitVoiceSession,
  requestLiveKitCredentials,
  type LiveKitVoiceSession,
  type VoiceSessionSnapshot,
} from '@/voice/livekit-voice-session';

const DISCONNECTED_SNAPSHOT: VoiceSessionSnapshot = {
  connection: 'DISCONNECTED',
  microphone: 'OFF',
  participants: [],
  lastWasshoiEvent: null,
  error: null,
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contextKey(context: MultiplayerVoiceContext | null): string | null {
  if (context === null) return null;
  return `${context.roomName}:${context.participantIdentity}:${context.role}`;
}

export interface MultiplayerVoiceSession {
  readonly context: MultiplayerVoiceContext | null;
  readonly snapshot: VoiceSessionSnapshot;
  readonly busy: boolean;
  readonly enabled: boolean;
  enable(): Promise<void>;
  disable(): Promise<void>;
  toggleMicrophone(): Promise<void>;
}

/**
 * MATCHING中の明示的なユーザー操作からVoice接続を始める。
 * Phase 3でこの所有者をApp/Multiplayer Sessionへ上げるまで、画面を離れるとcleanupする。
 */
export function useMultiplayerVoiceSession({
  participantId,
  lobby,
  keepSession = true,
}: {
  participantId: string | null;
  lobby: LobbyMessage | null;
  /** falseになる画面遷移では、Room/Trackを必ず破棄する。 */
  keepSession?: boolean;
}): MultiplayerVoiceSession {
  const context = useMemo(
    () => resolveMultiplayerVoiceContext({ participantId, lobby }),
    [lobby, participantId],
  );
  const currentKey = contextKey(context);
  const [snapshot, setSnapshot] = useState<VoiceSessionSnapshot>(DISCONNECTED_SNAPSHOT);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const sessionRef = useRef<LiveKitVoiceSession | null>(null);
  const activeContextKeyRef = useRef<string | null>(null);

  const disconnect = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    sessionRef.current = null;
    activeContextKeyRef.current = null;
    setEnabled(false);
    await session?.disconnect().catch(() => undefined);
    setSnapshot(DISCONNECTED_SNAPSHOT);
  }, []);

  useEffect(() => {
    const contextChanged = activeContextKeyRef.current !== currentKey;
    if (sessionRef.current === null || (keepSession && !contextChanged)) return;
    void disconnect();
  }, [currentKey, disconnect, keepSession]);

  useEffect(
    () => () => {
      void disconnect();
    },
    [disconnect],
  );

  const enable = useCallback(async (): Promise<void> => {
    if (context === null || sessionRef.current !== null || busy) return;
    setBusy(true);
    const session = createLiveKitVoiceSession({
      role: context.role,
      onSnapshot: setSnapshot,
      // PAYのWasshoi再生・入力はPhase 4で本番導線へ接続する。
      onWasshoi: () => undefined,
    });
    sessionRef.current = session;
    activeContextKeyRef.current = currentKey;

    try {
      const credentials = await requestLiveKitCredentials(liveKitTokenRequestFor(context));
      await session.connect(credentials);
      // PAYはpublish禁止を接続直後にも明示する。VAD入力はPhase 4で追加する。
      await session.setMicrophoneEnabled(context.role !== 'PAY');
      setEnabled(true);
    } catch (error) {
      await disconnect();
      setSnapshot((current) => ({ ...current, error: messageOf(error) }));
    } finally {
      setBusy(false);
    }
  }, [busy, context, currentKey, disconnect]);

  const toggleMicrophone = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (session === null || context === null || context.role === 'PAY') return;
    try {
      await session.setMicrophoneEnabled(snapshot.microphone !== 'ON');
    } catch (error) {
      setSnapshot((current) => ({ ...current, error: messageOf(error) }));
    }
  }, [context, snapshot.microphone]);

  return {
    context,
    snapshot,
    busy,
    enabled,
    enable,
    disable: disconnect,
    toggleMicrophone,
  };
}
