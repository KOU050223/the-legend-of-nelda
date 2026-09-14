import { describe, expect, it, vi } from 'vitest';

import { createFakeClock } from '@/game/clock';

import type {
  AudioAnalysisSessionFactory,
  AudioInputStream,
  AudioInputTrack,
} from './microphone-adapter';
import { attachMicrophoneNoteInput } from './microphone-adapter';
import { midiToHz } from './note-classifier';
import type { PitchDetector } from './pitch-detector';
import type { MicrophoneInputStatus, NoteEvent, PitchFrame } from './types';

/**
 * jsdom には getUserMedia も AudioContext も無いため、Adapter の
 * 外部依存をすべて差し替えて配線だけを確認する。
 * Pitch 検出そのものは pitch-detector.test.ts で確認している。
 */

const C5 = 72;

function createFakeTrack(): AudioInputTrack & { stopped: boolean } {
  const track = {
    stopped: false,
    stop() {
      track.stopped = true;
    },
    getSettings: () => ({ channelCount: 1, sampleRate: 48_000 }),
  };
  return track;
}

function createFakeStream(track: AudioInputTrack): AudioInputStream {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
}

interface FakeSession {
  create: AudioAnalysisSessionFactory;
  disposed: boolean;
  framesRead: number;
}

/** 解析セッションの偽物。読み取り内容は Pitch Detector 側で決める。 */
function createFakeSession(): FakeSession {
  const state: FakeSession = {
    create: () => ({
      sampleRate: 48_000,
      frameSize: 2048,
      readFrame: () => {
        state.framesRead += 1;
      },
      dispose: () => {
        state.disposed = true;
      },
    }),
    disposed: false,
    framesRead: 0,
  };
  return state;
}

/** 決められたフレーム列を順に返す Pitch Detector。 */
function createScriptedDetector(frames: readonly (PitchFrame | null)[]): PitchDetector {
  let index = 0;
  return {
    detect(_samples, _sampleRate, timestampMs) {
      const frame = frames[index];
      index += 1;
      if (frame === undefined || frame === null) return null;
      return { ...frame, timestampMs };
    },
  };
}

function voicedFrame(midi: number): PitchFrame {
  return { frequencyHz: midiToHz(midi), clarity: 0.98, rms: 0.2, timestampMs: 0 };
}

/** setInterval の代わり。テストから手動でフレームを進める。 */
function createManualTimer() {
  let handler: (() => void) | null = null;
  return {
    setInterval: (fn: () => void) => {
      handler = fn;
      return 1;
    },
    clearInterval: () => {
      handler = null;
    },
    tick(times = 1): void {
      for (let i = 0; i < times; i += 1) handler?.();
    },
    get running(): boolean {
      return handler !== null;
    },
  };
}

interface HarnessOptions {
  frames?: readonly (PitchFrame | null)[];
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<AudioInputStream>;
}

async function attachHarness(options: HarnessOptions = {}) {
  const track = createFakeTrack();
  const stream = createFakeStream(track);
  const session = createFakeSession();
  const timer = createManualTimer();
  const clock = createFakeClock();
  const events: NoteEvent[] = [];
  const statuses: MicrophoneInputStatus[] = [];

  const getUserMedia = options.getUserMedia ?? (() => Promise.resolve(stream));

  const stop = await attachMicrophoneNoteInput((event) => events.push(event), {
    clock,
    detector: createScriptedDetector(options.frames ?? []),
    getUserMedia,
    createSession: session.create,
    onStatusChange: (status) => statuses.push(status),
    setInterval: timer.setInterval,
    clearInterval: timer.clearInterval,
  });

  return { stop, track, session, timer, clock, events, statuses };
}

describe('attachMicrophoneNoteInput', () => {
  it('加工されていない音を要求する', async () => {
    const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<AudioInputStream>>(
      () => Promise.resolve(createFakeStream(createFakeTrack())),
    );

    const { stop } = await attachHarness({ getUserMedia });
    stop();

    // 完全一致ではなく ideal で要求する。対応しない機器で
    // OverconstrainedError にせず、実値を受け入れられるようにするため。
    const constraints = getUserMedia.mock.calls[0]?.[0];
    expect(constraints?.audio).toMatchObject({
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
    });
  });

  it('マイクを掴めたら動作中になる', async () => {
    const { stop, statuses } = await attachHarness();

    expect(statuses).toEqual(['requesting-permission', 'active']);
    stop();
  });

  it('安定した音をゲームへ通知する', async () => {
    const frames = [voicedFrame(C5), voicedFrame(C5), voicedFrame(C5)];
    const { stop, timer, events } = await attachHarness({ frames });

    timer.tick(3);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('note-on');
    expect(events[0]?.note.name).toBe('C');
    stop();
  });

  it('閾値を満たさないフレームでは通知しない', async () => {
    // 音量が足りないフレームばかりの状態。吹いていないのに暴発しないこと。
    const quiet = { ...voicedFrame(C5), rms: 0.0001 };
    const { stop, timer, events } = await attachHarness({ frames: [quiet, quiet, quiet, quiet] });

    timer.tick(4);

    expect(events).toEqual([]);
    stop();
  });

  it('鳴り止んだら鳴り終わったと通知する', async () => {
    const frames = [voicedFrame(C5), voicedFrame(C5), voicedFrame(C5), null, null];
    const { stop, timer, clock, events } = await attachHarness({ frames });

    timer.tick(3);
    // 猶予（120ms）を超える無音を与える。
    clock.advance(500);
    timer.tick(2);

    expect(events.map((event) => event.type)).toEqual(['note-on', 'note-off']);
    stop();
  });

  it('停止するとマイクを解放する', async () => {
    const { stop, track, session, timer } = await attachHarness();

    stop();

    expect(track.stopped).toBe(true);
    expect(session.disposed).toBe(true);
    expect(timer.running).toBe(false);
  });

  // note-on を出しっぱなしで購読を終わらせない。対の note-off が無いと
  // 購読側が「鳴り続けている」と思ったまま残る。
  it('鳴っている途中で停止したら鳴り終わったと通知する', async () => {
    const frames = [voicedFrame(C5), voicedFrame(C5), voicedFrame(C5)];
    const { stop, timer, events } = await attachHarness({ frames });

    timer.tick(3);
    stop();

    expect(events.map((event) => event.type)).toEqual(['note-on', 'note-off']);
    expect(events.at(-1)?.note.name).toBe('C');
  });

  it('鳴っていなければ停止しても通知しない', async () => {
    const { stop, events } = await attachHarness();

    stop();

    expect(events).toEqual([]);
  });

  it('解析の後始末が失敗してもマイクは解放する', async () => {
    const track = createFakeTrack();
    const timer = createManualTimer();

    const stop = await attachMicrophoneNoteInput(() => undefined, {
      clock: createFakeClock(),
      detector: createScriptedDetector([]),
      getUserMedia: () => Promise.resolve(createFakeStream(track)),
      createSession: () => ({
        sampleRate: 48_000,
        frameSize: 2048,
        readFrame: () => undefined,
        dispose: () => {
          throw new Error('dispose failed');
        },
      }),
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
    });

    expect(() => stop()).toThrow('dispose failed');
    expect(track.stopped).toBe(true);
  });

  it('停止後はフレームを解析しない', async () => {
    const frames = [voicedFrame(C5), voicedFrame(C5), voicedFrame(C5)];
    const { stop, timer, events } = await attachHarness({ frames });

    stop();
    timer.tick(3);

    expect(events).toEqual([]);
  });

  it('停止を二度呼んでも問題ない', async () => {
    const { stop, statuses } = await attachHarness();

    stop();
    stop();

    expect(statuses.filter((status) => status === 'idle')).toHaveLength(1);
  });

  it('マイクを拒否されたら拒否として扱う', async () => {
    const denied = new Error('denied');
    denied.name = 'NotAllowedError';

    const statuses: MicrophoneInputStatus[] = [];
    await expect(
      attachMicrophoneNoteInput(() => undefined, {
        getUserMedia: () => Promise.reject(denied),
        onStatusChange: (status) => statuses.push(status),
      }),
    ).rejects.toThrow('denied');

    expect(statuses.at(-1)).toBe('permission-denied');
  });

  it('マイクが見つからなければデバイス無しとして扱う', async () => {
    const notFound = new Error('no device');
    notFound.name = 'NotFoundError';

    const statuses: MicrophoneInputStatus[] = [];
    await expect(
      attachMicrophoneNoteInput(() => undefined, {
        getUserMedia: () => Promise.reject(notFound),
        onStatusChange: (status) => statuses.push(status),
      }),
    ).rejects.toThrow('no device');

    expect(statuses.at(-1)).toBe('device-not-found');
  });

  it('解析を組めなければマイクを掴んだままにしない', async () => {
    const track = createFakeTrack();

    await expect(
      attachMicrophoneNoteInput(() => undefined, {
        getUserMedia: () => Promise.resolve(createFakeStream(track)),
        createSession: () => {
          throw new Error('no audio context');
        },
      }),
    ).rejects.toThrow('no audio context');

    expect(track.stopped).toBe(true);
  });

  // getUserMedia の失敗理由を、UI が扱える状態へ寄せられること。
  it.each([
    { name: 'SecurityError', status: 'permission-denied' },
    { name: 'OverconstrainedError', status: 'device-not-found' },
    { name: 'AbortError', status: 'error' },
  ])('$name は $status として扱う', async ({ name, status }) => {
    const failure = new Error('failed');
    failure.name = name;

    const statuses: MicrophoneInputStatus[] = [];
    await expect(
      attachMicrophoneNoteInput(() => undefined, {
        getUserMedia: () => Promise.reject(failure),
        onStatusChange: (value) => statuses.push(value),
      }),
    ).rejects.toThrow('failed');

    expect(statuses.at(-1)).toBe(status);
  });

  it('Error でない失敗もエラーとして扱う', async () => {
    const statuses: MicrophoneInputStatus[] = [];
    await expect(
      attachMicrophoneNoteInput(() => undefined, {
        // 名前を持たない値で reject される環境もあるため、Error 以外も扱えること。
        // eslint-disable-next-line prefer-promise-reject-errors
        getUserMedia: () => Promise.reject('boom'),
        onStatusChange: (value) => statuses.push(value),
      }),
    ).rejects.toBe('boom');

    expect(statuses.at(-1)).toBe('error');
  });

  it('動作中は毎フレーム波形を読む', async () => {
    const frames = [voicedFrame(C5), voicedFrame(C5), voicedFrame(C5)];
    const { stop, timer, session } = await attachHarness({ frames });

    timer.tick(3);

    expect(session.framesRead).toBe(3);
    stop();
  });

  it('実際に適用されたマイク設定をデバッグへ渡す', async () => {
    const snapshots: unknown[] = [];
    const timer = createManualTimer();
    const session = createFakeSession();

    const stop = await attachMicrophoneNoteInput(() => undefined, {
      clock: createFakeClock(),
      detector: createScriptedDetector([voicedFrame(C5)]),
      getUserMedia: () => Promise.resolve(createFakeStream(createFakeTrack())),
      createSession: session.create,
      onDebug: (snapshot) => snapshots.push(snapshot),
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
    });

    timer.tick();
    stop();

    expect(snapshots[0]).toMatchObject({
      status: 'active',
      accepted: true,
      trackSettings: { channelCount: 1, sampleRate: 48_000 },
    });
  });
});
