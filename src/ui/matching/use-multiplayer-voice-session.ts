import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  attachWasshoiInput,
  type WasshoiInputController,
  type WasshoiInputStatus,
} from '@/input/wasshoi/wasshoi-input';
import { playSystemWasshoi } from '@/input/wasshoi/system-wasshoi-engine';
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
  readonly payInputActive: boolean;
  readonly payInputStatus: WasshoiInputStatus;
  enable(): Promise<void>;
  disable(): Promise<void>;
  toggleMicrophone(): Promise<void>;
}

/**
 * MATCHING中の明示的なユーザー操作からVoice接続を始める。
 * PAYは生音声Trackをpublishせず、ローカルVADのWasshoiEventだけを送る。
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
  const [payInputStatus, setPayInputStatus] = useState<WasshoiInputStatus>('idle');
  const [payInputActive, setPayInputActive] = useState(false);
  const sessionRef = useRef<LiveKitVoiceSession | null>(null);
  const payInputRef = useRef<WasshoiInputController | null>(null);
  const activeContextKeyRef = useRef<string | null>(null);
  const wasshoiVariantRef = useRef(0);

  const stopPayInput = useCallback((): void => {
    payInputRef.current?.stop();
    payInputRef.current = null;
    setPayInputActive(false);
    setPayInputStatus('idle');
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    stopPayInput();
    const session = sessionRef.current;
    sessionRef.current = null;
    activeContextKeyRef.current = null;
    setEnabled(false);
    await session?.disconnect().catch(() => undefined);
    setSnapshot(DISCONNECTED_SNAPSHOT);
  }, [stopPayInput]);

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
      onWasshoi: (event) => {
        // PAYが自分で生成音を再生すると、スピーカー出力を再びVADが拾う経路ができる。
        // 送信者PAYでは再生せず、受信する他Roleだけがシステム音声を鳴らす。
        if (context.role === 'PAY') return;
        playSystemWasshoi(event, wasshoiVariantRef.current);
        wasshoiVariantRef.current += 1;
      },
    });
    sessionRef.current = session;
    activeContextKeyRef.current = currentKey;

    try {
      const credentials = await requestLiveKitCredentials(liveKitTokenRequestFor(context));
      await session.connect(credentials);
    } catch (error) {
      await disconnect();
      setSnapshot((current) => ({ ...current, error: messageOf(error) }));
      setBusy(false);
      return;
    }

    try {
      // PAYはこの呼び出しでもAudio Trackを作らず、WASSHOI MODEを明示する。
      await session.setMicrophoneEnabled(context.role !== 'PAY');
      if (context.role === 'PAY') {
        const input = await attachWasshoiInput((event) => void session.sendWasshoi(event), {
          onStatusChange: setPayInputStatus,
        });
        // Role変更やTITLE復帰と競合した入力は即座に破棄する。
        if (sessionRef.current !== session || activeContextKeyRef.current !== currentKey) {
          input.stop();
        } else {
          payInputRef.current = input;
          setPayInputActive(true);
        }
      }
    } catch (error) {
      // Mic/VADの許可失敗はRoom接続を壊さず、UIだけへエラーを渡す。
      setSnapshot((current) => ({ ...current, error: messageOf(error) }));
    } finally {
      if (sessionRef.current === session) setEnabled(true);
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
    payInputActive,
    payInputStatus,
    enable,
    disable: disconnect,
    toggleMicrophone,
  };
}
