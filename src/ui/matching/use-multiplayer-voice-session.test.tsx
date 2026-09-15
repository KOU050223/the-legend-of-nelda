import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LobbyMessage } from '@/multiplayer/protocol';

const mocks = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
  requestCredentials: vi.fn<() => Promise<{ url: string; token: string }>>(),
  setMicrophoneEnabled: vi.fn<() => Promise<void>>(),
  createSession: vi.fn<
    (options: unknown) => {
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
      sendWasshoi: () => void;
      setMicrophoneEnabled: () => Promise<void>;
    }
  >(),
}));

vi.mock('@/voice/livekit-voice-session', () => ({
  createLiveKitVoiceSession: mocks.createSession,
  requestLiveKitCredentials: mocks.requestCredentials,
}));

mocks.createSession.mockImplementation(() => ({
  connect: mocks.connect,
  disconnect: mocks.disconnect,
  sendWasshoi: vi.fn<() => void>(),
  setMicrophoneEnabled: mocks.setMicrophoneEnabled,
}));

import { useMultiplayerVoiceSession } from './use-multiplayer-voice-session';

function lobbyFor(role: 'ODORUNO' | 'PAY' | 'ORA'): LobbyMessage {
  return {
    type: 'LOBBY',
    slots: [
      { participantId: 'participant-local', role, connected: true },
      { participantId: 'participant-other', role: role === 'PAY' ? 'ORA' : 'PAY', connected: true },
    ],
    started: false,
    full: false,
  };
}

describe('useMultiplayerVoiceSession', () => {
  beforeEach(() => {
    mocks.connect.mockResolvedValue(undefined);
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.requestCredentials.mockResolvedValue({ url: 'wss://voice.example', token: 'token' });
    mocks.setMicrophoneEnabled.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it('Authorityが確定したRoleでTokenを要求し、ODORUNOのマイクだけを有効にする', async () => {
    const { result } = renderHook(() =>
      useMultiplayerVoiceSession({
        participantId: 'participant-local',
        lobby: lobbyFor('ODORUNO'),
      }),
    );

    await act(async () => {
      await result.current.enable();
    });

    expect(mocks.requestCredentials).toHaveBeenCalledWith({
      roomName: 'nelda-demo',
      playerId: 'participant-local',
      role: 'ODORUNO',
    });
    expect(mocks.connect).toHaveBeenCalledWith({ url: 'wss://voice.example', token: 'token' });
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('PAYでは接続してもmicrophone audio trackを有効にしない', async () => {
    const { result } = renderHook(() =>
      useMultiplayerVoiceSession({ participantId: 'participant-local', lobby: lobbyFor('PAY') }),
    );

    await act(async () => {
      await result.current.enable();
    });

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('Authority上のRoleが変わったら古いVoice Sessionを切断する', async () => {
    const { result, rerender } = renderHook(
      ({ lobby }) => useMultiplayerVoiceSession({ participantId: 'participant-local', lobby }),
      { initialProps: { lobby: lobbyFor('ORA') } },
    );

    await act(async () => {
      await result.current.enable();
    });
    rerender({ lobby: lobbyFor('PAY') });

    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  });
});
