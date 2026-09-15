import { useCallback, useEffect, useRef, useState } from 'react';

import { playSystemWasshoi } from '@/input/wasshoi/system-wasshoi-engine';
import {
  attachWasshoiInput,
  type WasshoiInputController,
  type WasshoiInputStatus,
} from '@/input/wasshoi/wasshoi-input';
import type { WasshoiEvent } from '@/input/wasshoi/types';
import {
  createLiveKitVoiceSession,
  requestDevelopmentLiveKitCredentials,
  requestLiveKitCredentials,
  type LiveKitVoiceSession,
  type VoiceRole,
  type VoiceSessionSnapshot,
} from '@/voice/livekit-voice-session';

const defaultSnapshot: VoiceSessionSnapshot = {
  connection: 'DISCONNECTED',
  microphone: 'OFF',
  participants: [],
  lastWasshoiEvent: null,
  error: null,
};

function createPlayerId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return `daisuke-${uuid.slice(0, 8)}`;

  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(bytes);
  const suffix = (bytes[0] ?? Math.floor(Math.random() * 0x1_0000_0000)).toString(36);
  return `daisuke-${Date.now().toString(36)}-${suffix}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface VoiceDebugSession {
  role: VoiceRole;
  roomName: string;
  playerId: string;
  liveKitUrl: string;
  developmentToken: string;
  developmentTokenServerId: string;
  snapshot: VoiceSessionSnapshot;
  payMicStatus: WasshoiInputStatus;
  payInputActive: boolean;
  busy: boolean;
  connected: boolean;
  setRole(role: VoiceRole): void;
  setRoomName(roomName: string): void;
  setPlayerId(playerId: string): void;
  setLiveKitUrl(liveKitUrl: string): void;
  setDevelopmentToken(token: string): void;
  setDevelopmentTokenServerId(tokenServerId: string): void;
  connect(): Promise<void>;
  issueDevelopmentToken(): Promise<void>;
  toggleMicrophone(): Promise<void>;
  disconnect(): Promise<void>;
}

/** Voice Debug の接続・マイク・token発行をまとめ、画面表示から分離する。 */
export function useVoiceDebugSession(): VoiceDebugSession {
  const [role, setRole] = useState<VoiceRole>('ODORUNO');
  const [roomName, setRoomName] = useState('nelda-dev');
  const [playerId, setPlayerId] = useState(createPlayerId);
  const [liveKitUrl, setLiveKitUrl] = useState(import.meta.env.VITE_LIVEKIT_URL ?? '');
  const [developmentToken, setDevelopmentToken] = useState('');
  const [developmentTokenServerId, setDevelopmentTokenServerId] = useState(
    import.meta.env.VITE_LIVEKIT_DEVELOPMENT_TOKEN_SERVER_ID ?? '',
  );
  const [snapshot, setSnapshot] = useState<VoiceSessionSnapshot>(defaultSnapshot);
  const [payMicStatus, setPayMicStatus] = useState<WasshoiInputStatus>('idle');
  const [payInputActive, setPayInputActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<LiveKitVoiceSession | null>(null);
  const wasshoiRef = useRef<WasshoiInputController | null>(null);
  const variantRef = useRef(0);

  const setError = useCallback((error: unknown): void => {
    setSnapshot((current) => ({ ...current, error: messageOf(error) }));
  }, []);
  const stopPayInput = useCallback((): void => {
    wasshoiRef.current?.stop();
    wasshoiRef.current = null;
    setPayMicStatus('idle');
    setPayInputActive(false);
  }, []);
  const disconnect = useCallback(async (): Promise<void> => {
    stopPayInput();
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.disconnect();
    setSnapshot(defaultSnapshot);
  }, [stopPayInput]);

  useEffect(
    () => () => {
      void disconnect();
    },
    [disconnect],
  );

  const connect = useCallback(async (): Promise<void> => {
    if (sessionRef.current !== null || busy) return;
    setBusy(true);
    const session = createLiveKitVoiceSession({
      role,
      onSnapshot: setSnapshot,
      onWasshoi: (event) => {
        playSystemWasshoi(event, variantRef.current);
        variantRef.current += 1;
      },
    });
    sessionRef.current = session;
    try {
      const credentials =
        developmentToken.trim() === ''
          ? await requestLiveKitCredentials({ roomName, playerId, role })
          : { url: liveKitUrl.trim(), token: developmentToken.trim() };
      if (credentials.url === '') throw new Error('LiveKit Project URL を入力してください');
      await session.connect(credentials);
      if (role === 'PAY') await session.setMicrophoneEnabled(false);
    } catch (error) {
      sessionRef.current = null;
      setError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, developmentToken, liveKitUrl, playerId, role, roomName, setError]);

  const issueDevelopmentToken = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const credentials = await requestDevelopmentLiveKitCredentials(developmentTokenServerId, {
        roomName,
        playerId,
        role,
      });
      setLiveKitUrl(credentials.url);
      setDevelopmentToken(credentials.token);
      setSnapshot((current) => ({ ...current, error: null }));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, developmentTokenServerId, playerId, role, roomName, setError]);

  const toggleMicrophone = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (session === null) return;
    if (role !== 'PAY') {
      try {
        await session.setMicrophoneEnabled(snapshot.microphone !== 'ON');
      } catch (error) {
        setError(error);
      }
      return;
    }
    if (wasshoiRef.current !== null) {
      stopPayInput();
      return;
    }
    try {
      wasshoiRef.current = await attachWasshoiInput(
        (event: WasshoiEvent) => void session.sendWasshoi(event),
        { onStatusChange: setPayMicStatus },
      );
      setPayInputActive(true);
    } catch (error) {
      setError(error);
    }
  }, [role, setError, snapshot.microphone, stopPayInput]);

  return {
    role,
    roomName,
    playerId,
    liveKitUrl,
    developmentToken,
    developmentTokenServerId,
    snapshot,
    payMicStatus,
    payInputActive,
    busy,
    connected: snapshot.connection === 'CONNECTED' || snapshot.connection === 'RECONNECTING',
    setRole,
    setRoomName,
    setPlayerId,
    setLiveKitUrl,
    setDevelopmentToken,
    setDevelopmentTokenServerId,
    connect,
    issueDevelopmentToken,
    toggleMicrophone,
    disconnect,
  };
}
