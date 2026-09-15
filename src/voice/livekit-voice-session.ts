import { ConnectionState, Room, RoomEvent, Track, type Participant } from 'livekit-client';

import type { WasshoiEvent } from '@/input/wasshoi/types';

export const WASSHOI_TOPIC = 'nelda.wasshoi.v1';

export type VoiceRole = 'ODORUNO' | 'ORA' | 'PAY';
export type VoiceConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export interface LiveKitCredentials {
  url: string;
  token: string;
}

export interface VoiceParticipant {
  identity: string;
  name: string;
  isSpeaking: boolean;
}

export interface VoiceSessionSnapshot {
  connection: VoiceConnectionState;
  microphone: 'OFF' | 'ON' | 'WASSHOI MODE';
  participants: VoiceParticipant[];
  lastWasshoiEvent: WasshoiEvent | null;
  error: string | null;
}

export interface LiveKitTokenRequest {
  roomName: string;
  playerId: string;
  role: VoiceRole;
}

export interface LiveKitVoiceSession {
  connect(credentials: LiveKitCredentials): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  sendWasshoi(event: WasshoiEvent): Promise<void>;
  disconnect(): Promise<void>;
}

export interface CreateLiveKitVoiceSessionOptions {
  role: VoiceRole;
  onSnapshot: (snapshot: VoiceSessionSnapshot) => void;
  onWasshoi: (event: WasshoiEvent) => void;
}

const initialSnapshot: VoiceSessionSnapshot = {
  connection: 'DISCONNECTED',
  microphone: 'OFF',
  participants: [],
  lastWasshoiEvent: null,
  error: null,
};

function asConnectionState(state: ConnectionState): VoiceConnectionState {
  if (state === ConnectionState.Connected) return 'CONNECTED';
  if (state === ConnectionState.Connecting) return 'CONNECTING';
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
    return 'RECONNECTING';
  }
  return 'DISCONNECTED';
}

function toParticipant(participant: Participant): VoiceParticipant {
  return {
    identity: participant.identity,
    name: participant.name ?? participant.identity,
    isSpeaking: participant.isSpeaking,
  };
}

function isWasshoiEvent(value: unknown): value is WasshoiEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<WasshoiEvent>;
  return (
    event.type === 'WASSHOI' &&
    typeof event.intensity === 'number' &&
    Number.isFinite(event.intensity) &&
    event.intensity >= 0 &&
    event.intensity <= 1 &&
    typeof event.durationMs === 'number' &&
    Number.isFinite(event.durationMs) &&
    event.durationMs >= 0
  );
}

function isLiveKitCredentialResponse(value: unknown): value is { token: string; url?: string } {
  if (typeof value !== 'object' || value === null) return false;
  const token = Reflect.get(value, 'token');
  const url = Reflect.get(value, 'url');
  return typeof token === 'string' && (url === undefined || typeof url === 'string');
}

export function decodeWasshoiEvent(payload: Uint8Array): WasshoiEvent | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    return isWasshoiEvent(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Token is always acquired from a server endpoint. API secret must never reach this browser.
 * `VITE_LIVEKIT_DEV_TOKEN` is deliberately only a short-lived, manually generated development
 * token; it is a fallback for the static-site PoC and is not a credential used to mint tokens.
 */
export async function requestLiveKitCredentials(
  request: LiveKitTokenRequest,
  fetcher: typeof fetch = fetch,
): Promise<LiveKitCredentials> {
  const endpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT;
  const configuredUrl = import.meta.env.VITE_LIVEKIT_URL;
  const developmentToken = import.meta.env.VITE_LIVEKIT_DEV_TOKEN;

  if (endpoint !== undefined && endpoint !== '') {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`LiveKit token request failed (${response.status})`);
    const body: unknown = await response.json();
    if (!isLiveKitCredentialResponse(body) || typeof (body.url ?? configuredUrl) !== 'string') {
      throw new Error('LiveKit token endpoint returned an invalid response');
    }
    return {
      token: body.token,
      url: body.url ?? configuredUrl,
    };
  }

  if (configuredUrl !== undefined && configuredUrl !== '' && developmentToken !== undefined) {
    return { url: configuredUrl, token: developmentToken };
  }
  throw new Error('LiveKit token endpoint or development token is not configured');
}

/** A Room owns all listener and remote-audio cleanup for one game voice session. */
export function createLiveKitVoiceSession(
  options: CreateLiveKitVoiceSessionOptions,
): LiveKitVoiceSession {
  const room = new Room();
  let snapshot = { ...initialSnapshot };
  let connected = false;
  const audioElements = new Map<string, HTMLAudioElement>();

  const publishSnapshot = (patch: Partial<VoiceSessionSnapshot> = {}): void => {
    snapshot = { ...snapshot, ...patch };
    options.onSnapshot(snapshot);
  };
  const refreshParticipants = (): void => {
    const local = room.localParticipant.identity ? [toParticipant(room.localParticipant)] : [];
    publishSnapshot({
      participants: [...local, ...[...room.remoteParticipants.values()].map(toParticipant)],
    });
  };
  const removeAudio = (trackSid: string): void => {
    const element = audioElements.get(trackSid);
    element?.remove();
    audioElements.delete(trackSid);
  };

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    publishSnapshot({ connection: asConnectionState(state) });
  });
  room.on(RoomEvent.ParticipantConnected, refreshParticipants);
  room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
  room.on(RoomEvent.ActiveSpeakersChanged, refreshParticipants);
  room.on(RoomEvent.TrackSubscribed, (track, publication) => {
    if (track.kind !== Track.Kind.Audio) return;
    const element = track.attach();
    element.autoplay = true;
    element.dataset.livekitTrackSid = publication.trackSid;
    document.body.append(element);
    audioElements.set(publication.trackSid, element);
  });
  room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => removeAudio(publication.trackSid));
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    if (topic !== WASSHOI_TOPIC) return;
    const event = decodeWasshoiEvent(payload);
    if (event === null) return;
    publishSnapshot({ lastWasshoiEvent: event });
    options.onWasshoi(event);
  });
  room.on(RoomEvent.Disconnected, () => {
    connected = false;
    for (const trackSid of audioElements.keys()) removeAudio(trackSid);
    publishSnapshot({ ...initialSnapshot });
  });

  return {
    async connect(credentials): Promise<void> {
      if (connected) return;
      publishSnapshot({ connection: 'CONNECTING', error: null });
      try {
        await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
        await room.startAudio();
        connected = true;
        publishSnapshot({ connection: 'CONNECTED' });
        refreshParticipants();
      } catch (error) {
        publishSnapshot({ connection: 'DISCONNECTED', error: errorMessage(error) });
        throw error;
      }
    },
    async setMicrophoneEnabled(enabled): Promise<void> {
      if (!connected) throw new Error('LiveKit room is not connected');
      if (options.role === 'PAY') {
        if (enabled) throw new Error('PAY must not publish a microphone audio track');
        publishSnapshot({ microphone: 'WASSHOI MODE' });
        return;
      }
      await room.localParticipant.setMicrophoneEnabled(enabled, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      publishSnapshot({ microphone: enabled ? 'ON' : 'OFF' });
    },
    async sendWasshoi(event): Promise<void> {
      if (!connected) return;
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
        reliable: true,
        topic: WASSHOI_TOPIC,
      });
      publishSnapshot({ lastWasshoiEvent: event });
    },
    async disconnect(): Promise<void> {
      if (!connected && room.state === ConnectionState.Disconnected) return;
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      await room.disconnect(true);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
