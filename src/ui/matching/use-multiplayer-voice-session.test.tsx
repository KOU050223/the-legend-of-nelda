import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LobbyMessage } from '@/multiplayer/protocol';
import type { WasshoiInputController } from '@/input/wasshoi/wasshoi-input';

interface MockVoiceSessionOptions {
  onWasshoi(event: { type: 'WASSHOI'; intensity: number; durationMs: number }): void;
}

const mocks = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
  requestCredentials: vi.fn<() => Promise<{ url: string; token: string }>>(),
  setMicrophoneEnabled: vi.fn<() => Promise<void>>(),
  attachWasshoiInput:
    vi.fn<
      (
        onEvent: (event: { type: 'WASSHOI'; intensity: number; durationMs: number }) => void,
      ) => Promise<WasshoiInputController>
    >(),
  playSystemWasshoi: vi.fn<(event: unknown, variant: number) => boolean>(),
  sendWasshoi: vi.fn<() => Promise<void>>(),
  stopWasshoiInput: vi.fn<() => void>(),
  createSession: vi.fn<
    (options: MockVoiceSessionOptions) => {
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

vi.mock('@/input/wasshoi/wasshoi-input', () => ({
  attachWasshoiInput: mocks.attachWasshoiInput,
}));

vi.mock('@/input/wasshoi/system-wasshoi-engine', () => ({
  playSystemWasshoi: mocks.playSystemWasshoi,
}));

mocks.createSession.mockImplementation(() => ({
  connect: mocks.connect,
  disconnect: mocks.disconnect,
  sendWasshoi: mocks.sendWasshoi,
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
    mocks.attachWasshoiInput.mockResolvedValue({
      playWasshoi: vi.fn<() => Promise<boolean>>(),
      stop: mocks.stopWasshoiInput,
    });
    mocks.playSystemWasshoi.mockReturnValue(true);
    mocks.sendWasshoi.mockResolvedValue(undefined);
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

  it('PAYでは生音声Trackを有効にせず、VADのWasshoiEventだけを送る', async () => {
    const { result } = renderHook(() =>
      useMultiplayerVoiceSession({ participantId: 'participant-local', lobby: lobbyFor('PAY') }),
    );

    await act(async () => {
      await result.current.enable();
    });

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(mocks.attachWasshoiInput).toHaveBeenCalledOnce();
    const onEvent = mocks.attachWasshoiInput.mock.calls[0]?.[0];
    if (onEvent === undefined) throw new Error('Wasshoi input was not attached');
    onEvent({ type: 'WASSHOI', intensity: 0.7, durationMs: 800 });
    expect(mocks.sendWasshoi).toHaveBeenCalledWith({
      type: 'WASSHOI',
      intensity: 0.7,
      durationMs: 800,
    });
  });

  it('PAY自身は受信Wasshoiを再生せず、他Roleだけが再生する', async () => {
    const pay = renderHook(() =>
      useMultiplayerVoiceSession({ participantId: 'participant-local', lobby: lobbyFor('PAY') }),
    );
    await act(async () => {
      await pay.result.current.enable();
    });
    const payOptions = mocks.createSession.mock.calls[0]?.[0];
    if (payOptions === undefined) throw new Error('PAY voice session was not created');
    payOptions.onWasshoi({ type: 'WASSHOI', intensity: 0.6, durationMs: 600 });
    expect(mocks.playSystemWasshoi).not.toHaveBeenCalled();

    pay.unmount();
    const odoruno = renderHook(() =>
      useMultiplayerVoiceSession({
        participantId: 'participant-local',
        lobby: lobbyFor('ODORUNO'),
      }),
    );
    await act(async () => {
      await odoruno.result.current.enable();
    });
    const odorunoOptions = mocks.createSession.mock.calls[1]?.[0];
    if (odorunoOptions === undefined) throw new Error('ODORUNO voice session was not created');
    odorunoOptions.onWasshoi({ type: 'WASSHOI', intensity: 0.6, durationMs: 600 });
    expect(mocks.playSystemWasshoi).toHaveBeenCalledWith(
      { type: 'WASSHOI', intensity: 0.6, durationMs: 600 },
      0,
    );
  });

  it('PAYのマイク許可を拒否しても接続済みRoomを切断しない', async () => {
    mocks.attachWasshoiInput.mockRejectedValueOnce(new Error('permission denied'));
    const { result } = renderHook(() =>
      useMultiplayerVoiceSession({ participantId: 'participant-local', lobby: lobbyFor('PAY') }),
    );

    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.enabled).toBe(true);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(result.current.snapshot.error).toBe('permission denied');
  });

  it('PAY入力はVoice Sessionを無効化すると停止する', async () => {
    const { result } = renderHook(() =>
      useMultiplayerVoiceSession({ participantId: 'participant-local', lobby: lobbyFor('PAY') }),
    );

    await act(async () => {
      await result.current.enable();
      await result.current.disable();
    });

    expect(mocks.stopWasshoiInput).toHaveBeenCalledOnce();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
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

  it('MATCHINGからGAMEへ相当するkeepSession中は維持し、TITLE復帰時に切断する', async () => {
    const lobby = lobbyFor('ODORUNO');
    const { result, rerender } = renderHook(
      ({ keepSession }) =>
        useMultiplayerVoiceSession({
          participantId: 'participant-local',
          lobby,
          keepSession,
        }),
      { initialProps: { keepSession: true } },
    );

    await act(async () => {
      await result.current.enable();
    });
    rerender({ keepSession: true });
    expect(mocks.disconnect).not.toHaveBeenCalled();

    rerender({ keepSession: false });
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  });
});
