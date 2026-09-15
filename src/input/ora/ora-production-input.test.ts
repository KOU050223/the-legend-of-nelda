import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttachInputAdapter, GameAction } from '@/game/types/game-action';
import type { HandObservation } from './types';

type FakeTrack = { stop: () => void };
type FakeStream = {
  getTracks: () => readonly FakeTrack[];
  getAudioTracks: () => readonly FakeTrack[];
};
type FakeAudioSession = {
  sampleRate: number;
  frameSize: number;
  readFrame: ReturnType<typeof vi.fn<(samples: Float32Array<ArrayBuffer>) => void>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
};

const mocks = vi.hoisted(() => ({
  requestWebcam: vi.fn<() => Promise<FakeStream>>(),
  stopWebcam: vi.fn<(stream: FakeStream | undefined) => void>(),
  createMediaPipeHandDetector: vi.fn<() => Promise<unknown>>(),
  createWebAudioSession: vi.fn<() => Promise<FakeAudioSession>>(),
  getUserMedia: vi.fn<() => Promise<FakeStream>>(),
}));

vi.mock('./webcam', () => ({
  requestWebcam: mocks.requestWebcam,
  stopWebcam: mocks.stopWebcam,
}));

vi.mock('./hand-detector', () => ({
  createMediaPipeHandDetector: mocks.createMediaPipeHandDetector,
}));

vi.mock('../microphone/microphone-adapter', () => ({
  createWebAudioSession: mocks.createWebAudioSession,
}));

import {
  createOraProductionInput,
  type OraCalibrationState,
  type OraProductionInputStatus,
} from './ora-production-input';

type FrameCallback = (timestamp: number) => void;
type TimeoutCallback = { handler: () => void; milliseconds: number };

let cameraTrack: FakeTrack;
let audioTrack: FakeTrack;
let cameraStream: FakeStream;
let audioStream: FakeStream;
let audioSession: FakeAudioSession;
let frameCallbacks: Map<number, FrameCallback>;
let nextFrameId: number;
let intervalHandler: (() => void) | undefined;
let timeoutCallbacks: Map<number, TimeoutCallback>;
let nextTimeoutId: number;
let nowMs: number;
let rms: number;

class FakeSpeechRecognition {
  static readonly instances: FakeSpeechRecognition[] = [];

  continuous = false;
  interimResults = true;
  lang = '';
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  started = false;
  stopped = false;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: unknown) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  emitFinal(transcript: string): void {
    const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] };
    for (const listener of this.listeners.get('result') ?? []) listener(event);
  }
}

function hand(x: number, y: number): NonNullable<HandObservation['left']> {
  return { x, y, velocityX: 0, velocityY: 0, isOpen: true };
}

function runNextFrame(timestamp: number): void {
  const next = frameCallbacks.entries().next().value;
  expect(next).toBeDefined();
  if (next === undefined) return;
  frameCallbacks.delete(next[0]);
  next[1](timestamp);
}

function runInterval(): void {
  intervalHandler?.();
}

function runNextTimeout(): void {
  let next: [number, TimeoutCallback] | undefined;
  for (const entry of timeoutCallbacks) {
    if (next === undefined || entry[1].milliseconds < next[1].milliseconds) next = entry;
  }
  expect(next).toBeDefined();
  if (next === undefined) return;
  timeoutCallbacks.delete(next[0]);
  next[1].handler();
}

function createTestAttach(
  options: {
    onCalibrationChange?: (state: OraCalibrationState) => void;
    onStatusChange?: (status: OraProductionInputStatus) => void;
  } = {},
): AttachInputAdapter {
  return createOraProductionInput({
    ...options,
    now: () => nowMs,
    requestAnimationFrame: (callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => {
      frameCallbacks.delete(id);
    },
    setInterval: (handler) => {
      intervalHandler = handler;
      return 1;
    },
    clearInterval: () => {
      intervalHandler = undefined;
    },
    setTimeout: (handler, milliseconds) => {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      timeoutCallbacks.set(id, { handler, milliseconds });
      return id;
    },
    clearTimeout: (id) => {
      timeoutCallbacks.delete(id);
    },
  });
}

function completeCalibration(): void {
  nowMs = 0;
  rms = 0.2;
  runInterval();
  nowMs = 350;
  rms = 0;
  runInterval();
  runNextFrame(0);
  runNextFrame(1_000);
}

function submitUtterance(transcript: string, speechRms: number): void {
  nowMs = 1_000;
  rms = speechRms;
  runInterval();
  nowMs = 1_100;
  runInterval();
  FakeSpeechRecognition.instances.at(-1)?.emitFinal(transcript);
}

function attackActions(actions: readonly GameAction[]): GameAction[] {
  return actions.filter((action) => action.type === 'ATTACK');
}

function setupSuccessfulResources(): void {
  cameraTrack = { stop: vi.fn<() => void>() };
  audioTrack = { stop: vi.fn<() => void>() };
  cameraStream = { getTracks: () => [cameraTrack], getAudioTracks: () => [] };
  audioStream = { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] };
  frameCallbacks = new Map();
  nextFrameId = 1;
  intervalHandler = undefined;
  timeoutCallbacks = new Map();
  nextTimeoutId = 1;
  nowMs = 0;
  rms = 0;
  FakeSpeechRecognition.instances.length = 0;

  const detector = {
    detect: vi.fn<(_video: HTMLVideoElement, capturedAt: number) => HandObservation>(
      (_video, capturedAt) => ({
        capturedAt,
        left: hand(0.2, 0.2),
        right: hand(0.8, 0.2),
      }),
    ),
    close: vi.fn<() => void>(),
  };
  audioSession = {
    sampleRate: 48_000,
    frameSize: 4,
    readFrame: vi.fn<(samples: Float32Array<ArrayBuffer>) => void>((samples) => samples.fill(rms)),
    dispose: vi.fn<() => void>(),
  };

  mocks.requestWebcam.mockResolvedValue(cameraStream);
  mocks.stopWebcam.mockImplementation((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  });
  mocks.createMediaPipeHandDetector.mockResolvedValue(detector);
  mocks.createWebAudioSession.mockResolvedValue(audioSession);
  mocks.getUserMedia.mockResolvedValue(audioStream);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: mocks.getUserMedia },
  });
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: FakeSpeechRecognition,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: undefined,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupSuccessfulResources();
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: undefined,
  });
});

describe('createOraProductionInput', () => {
  it('Calibration完了までは発火せず、完了後にMOVE・ATTACK・CHARACTER_ACTIONをGameActionへ変換する', async () => {
    const actions: GameAction[] = [];
    const calibration: OraCalibrationState[] = [];
    const adapter = await createTestAttach({
      onCalibrationChange: (state) => calibration.push(state),
    })((action) => actions.push(action));

    runNextFrame(0);
    expect(actions).toEqual([]);

    rms = 0.2;
    runInterval();
    nowMs = 350;
    rms = 0;
    runInterval();
    runNextFrame(1_000);

    expect(calibration.at(-1)).toEqual({ handComplete: true, voiceComplete: true, progress: 1 });
    expect(actions).toEqual([{ type: 'MOVE', input: { forward: 0, right: 0 } }]);

    nowMs = 1_000;
    rms = 0.2;
    runInterval();
    nowMs = 1_100;
    runInterval();
    FakeSpeechRecognition.instances.at(-1)?.emitFinal('オラ');
    runNextTimeout();
    runNextFrame(1_700);

    expect(actions.some((action) => action.type === 'ATTACK')).toBe(true);
    expect(actions.some((action) => action.type === 'CHARACTER_ACTION')).toBe(true);

    adapter.detach();
  });

  it('通常発話のRMSはCalibration時の大きい声量に左右されずATTACK閾値を通る', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    submitUtterance('オラ', 0.02);
    runNextTimeout();

    expect(attackActions(actions)).toEqual([{ type: 'ATTACK' }]);

    adapter.detach();
  });

  it('1発話の複数hitを140ms間隔で予約し、同一フレームではATTACKを一括送信しない', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    submitUtterance('オラオラ', 0.2);

    expect(attackActions(actions)).toEqual([]);
    expect([...timeoutCallbacks.values()].map((callback) => callback.milliseconds)).toEqual([
      0, 140,
    ]);

    runNextTimeout();
    expect(attackActions(actions)).toEqual([{ type: 'ATTACK' }]);
    runNextTimeout();
    expect(attackActions(actions)).toEqual([{ type: 'ATTACK' }, { type: 'ATTACK' }]);

    adapter.detach();
  });

  it('detach()は予約済みATTACKを解除し、後からタイマーが走っても送信しない', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    submitUtterance('オラオラ', 0.2);
    const queuedCallbacks = [...timeoutCallbacks.values()].map((callback) => callback.handler);

    expect(timeoutCallbacks.size).toBe(2);
    adapter.detach();
    expect(timeoutCallbacks.size).toBe(0);

    queuedCallbacks.forEach((callback) => callback());
    expect(attackActions(actions)).toEqual([]);
  });

  it('SpeechRecognition非対応でも手入力のMOVEとCHARACTER_ACTIONは継続する', async () => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    const statuses: OraProductionInputStatus[] = [];
    const actions: GameAction[] = [];
    const adapter = await createTestAttach({ onStatusChange: (status) => statuses.push(status) })(
      (action) => actions.push(action),
    );

    expect(statuses.some((status) => status.speechRecognition === 'unavailable')).toBe(true);

    rms = 0.2;
    runInterval();
    nowMs = 350;
    rms = 0;
    runInterval();
    runNextFrame(0);
    runNextFrame(1_000);
    runNextFrame(1_700);

    expect(actions.some((action) => action.type === 'MOVE')).toBe(true);
    expect(actions.some((action) => action.type === 'CHARACTER_ACTION')).toBe(true);
    expect(actions.some((action) => action.type === 'ATTACK')).toBe(false);

    adapter.detach();
  });

  it('detach()でカメラ・マイク・解析・音声認識・タイマー・フレームを解放する', async () => {
    const adapter = await createTestAttach()(() => undefined);

    adapter.detach();

    expect(mocks.stopWebcam).toHaveBeenCalledWith(cameraStream);
    expect(cameraTrack.stop).toHaveBeenCalledOnce();
    expect(audioTrack.stop).toHaveBeenCalledOnce();
    expect(audioSession.dispose).toHaveBeenCalledOnce();
    expect(FakeSpeechRecognition.instances.at(-1)?.stopped).toBe(true);
    expect(frameCallbacks.size).toBe(0);
    expect(intervalHandler).toBeUndefined();
  });

  it('カメラ許可拒否をerrorステータスへ変換し、呼び出し側へ未処理例外を残さない', async () => {
    const statuses: OraProductionInputStatus[] = [];
    mocks.requestWebcam.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));

    await expect(
      createTestAttach({ onStatusChange: (status) => statuses.push(status) })(() => undefined),
    ).rejects.toThrow('denied');

    expect(statuses.at(-1)).toMatchObject({ phase: 'error', reason: 'permission-denied' });
  });
});
