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
  type OraHandTrackingFrame,
  type OraProductionInputStatus,
} from './ora-production-input';
import { ORA_REVIVE_INPUT_INTERVAL_MS } from './ora-revive-recognizer';

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
let detectedHands: HandObservation;
let observedLeft: HandObservation['left'];

class FakeSpeechRecognition {
  static readonly instances: FakeSpeechRecognition[] = [];

  continuous = false;
  interimResults = true;
  lang = '';
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  started = false;
  startCount = 0;
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
    this.startCount += 1;
  }

  stop(): void {
    this.stopped = true;
  }

  emitFinal(transcript: string, resultIndex = 0): void {
    this.emitResult(transcript, true, resultIndex);
  }

  emitInterim(transcript: string, resultIndex = 0): void {
    this.emitResult(transcript, false, resultIndex);
  }

  private emitResult(transcript: string, isFinal: boolean, resultIndex: number): void {
    const results: unknown[] = Array.from({ length: resultIndex });
    results.push({ isFinal, 0: { transcript } });
    const event = { resultIndex, results };
    for (const listener of this.listeners.get('result') ?? []) listener(event);
  }

  emitError(error: string): void {
    for (const listener of this.listeners.get('error') ?? []) listener({ error });
  }

  emitEnd(): void {
    for (const listener of this.listeners.get('end') ?? []) listener(undefined);
  }
}

function hand(x: number, y: number, isOpen = true): NonNullable<HandObservation['left']> {
  return { x, y, velocityX: 0, velocityY: 0, isOpen, isClosed: !isOpen };
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
    onHandTrackingFrame?: (frame: OraHandTrackingFrame) => void;
    onStatusChange?: (status: OraProductionInputStatus) => void;
    signal?: AbortSignal;
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

type AttackAction = Extract<GameAction, { type: 'ATTACK' }>;

function attackActions(actions: readonly GameAction[]): AttackAction[] {
  return actions.filter((action): action is AttackAction => action.type === 'ATTACK');
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
  detectedHands = {
    capturedAt: 0,
    left: hand(0.2, 0.2),
    right: hand(0.8, 0.2),
  };
  observedLeft = hand(0.2, 0.2);
  FakeSpeechRecognition.instances.length = 0;

  const detector = {
    detect: vi.fn<(_video: HTMLVideoElement, capturedAt: number) => HandObservation>(
      (_video, capturedAt) => {
        const { left: _detectedLeft, ...withoutLeft } = detectedHands;
        return {
          ...withoutLeft,
          capturedAt,
          ...(observedLeft === undefined ? {} : { left: observedLeft }),
        };
      },
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
  it('Calibration完了前はMOVEだけゼロで送り続け、完了後にATTACK・CHARACTER_ACTIONもGameActionへ変換する', async () => {
    const actions: GameAction[] = [];
    const calibration: OraCalibrationState[] = [];
    const adapter = await createTestAttach({
      onCalibrationChange: (state) => calibration.push(state),
    })((action) => actions.push(action));

    runNextFrame(0);
    // Calibration未完了でもMOVEはゼロで送る (Hand LostでNeutral復帰の前提)。
    expect(actions).toEqual([{ type: 'MOVE', input: { forward: 0, right: 0 } }]);

    rms = 0.2;
    runInterval();
    nowMs = 350;
    rms = 0;
    runInterval();
    runNextFrame(1_000);

    expect(calibration.at(-1)).toEqual({ handComplete: true, voiceComplete: true, progress: 1 });
    expect(actions).toEqual([
      { type: 'MOVE', input: { forward: 0, right: 0 } },
      { type: 'MOVE', input: { forward: 0, right: 0 } },
    ]);

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

  it('Calibration中・完了後・見失い時の左手追跡フレームを通知する', async () => {
    const frames: OraHandTrackingFrame[] = [];
    const adapter = await createTestAttach({
      onHandTrackingFrame: (frame) => frames.push(frame),
    })(() => undefined);

    runNextFrame(0);
    expect(frames).toEqual([{ left: hand(0.2, 0.2), neutral: undefined }]);

    rms = 0.2;
    runInterval();
    nowMs = 350;
    rms = 0;
    runInterval();
    runNextFrame(1_000);
    expect(frames.at(-1)).toEqual({
      left: hand(0.2, 0.2),
      neutral: { x: 0.2, y: 0.2 },
    });

    observedLeft = undefined;
    runNextFrame(1_016);
    expect(frames.at(-1)).toEqual({ left: undefined, neutral: undefined });

    adapter.detach();
  });

  it('移動中に手を見失うとMOVEが直ちにゼロへ戻る (Hand LostでNeutral復帰)', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    observedLeft = hand(0.9, 0.9);
    runNextFrame(1_100);
    runNextFrame(1_200);
    const moveActions = () =>
      actions.filter(
        (action): action is Extract<GameAction, { type: 'MOVE' }> => action.type === 'MOVE',
      );
    expect(moveActions().at(-1)?.input).not.toEqual({ forward: 0, right: 0 });

    observedLeft = undefined;
    runNextFrame(1_300);

    expect(moveActions().at(-1)?.input).toEqual({ forward: 0, right: 0 });

    adapter.detach();
  });

  it('手を見失っていても、既に予約済みのATTACKは発火する (ATTACKは声だけの入力)', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    submitUtterance('オラオラ', 0.2);
    expect(timeoutCallbacks.size).toBe(2);

    observedLeft = undefined;
    runNextFrame(1_150);
    // ORA_ACTIONの判定はリセットされるが、ATTACKの予約は手の状態と無関係。
    expect(timeoutCallbacks.size).toBe(2);

    runNextTimeout();
    runNextTimeout();
    adapter.detach();
    expect(attackActions(actions)).toHaveLength(2);
  });

  it('手を一度も検出できなくても、声のCalibrationさえ済めばATTACKは発火する', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    observedLeft = undefined;
    nowMs = 0;
    rms = 0.2;
    runInterval();
    nowMs = 350;
    rms = 0;
    runInterval();
    runNextFrame(0);

    submitUtterance('オラ', 0.2);
    runNextTimeout();

    adapter.detach();
    expect(attackActions(actions)).toHaveLength(1);
  });

  it('通常発話のRMSはCalibration時の大きい声量に左右されずATTACK閾値を通る', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();

    // Calibrationの大声(0.2, t=0〜350)から現実的な間隔を空けてから発話する。
    // MAX_UTTERANCE_GAP_MSを超える無音を挟むので、古い音量ピークを引きずらない。
    nowMs = 3_000;
    rms = 0.02;
    runInterval();
    nowMs = 3_100;
    runInterval();
    FakeSpeechRecognition.instances.at(-1)?.emitFinal('オラ');
    runNextTimeout();

    expect(attackActions(actions)).toHaveLength(1);
    expect(attackActions(actions)[0]?.intensity).toBeCloseTo(3 / 13, 6);

    adapter.detach();
  });

  it('hangoverを超える無音で区切り直っても、連呼全体のピーク音量で判定する', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();

    // 「おら」を大声(0.2)で始める。
    nowMs = 3_000;
    rms = 0.2;
    runInterval();
    // hangoverMs(300ms)を超える無音を挟み、speechStartedAtが一度区切り直る。
    nowMs = 3_350;
    rms = 0;
    runInterval();
    // 続けて、閾値ぎりぎりの小声(0.01)で言い終える。
    nowMs = 3_500;
    rms = 0.01;
    runInterval();
    nowMs = 3_600;
    runInterval();
    FakeSpeechRecognition.instances.at(-1)?.emitFinal('おらおら');
    runNextTimeout();

    // 言い終わりの小声(0.01)だけで判定すればintensityは閾値未満で棄却される
    // (normalizeOraSpeechIntensity(0.01)は0.05を下回る)。連呼全体のピーク
    // (0.2)を見ているので通る。
    expect(attackActions(actions).length).toBeGreaterThan(0);

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
    expect(attackActions(actions)).toEqual([{ type: 'ATTACK', intensity: 1 }]);
    runNextTimeout();
    expect(attackActions(actions)).toEqual([
      { type: 'ATTACK', intensity: 1 },
      { type: 'ATTACK', intensity: 1 },
    ]);

    adapter.detach();
  });

  it('確定(isFinal)を待たず、interim結果の時点でオラに反応してATTACKを予約する', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    nowMs = 1_000;
    rms = 0.2;
    runInterval();
    nowMs = 1_100;
    runInterval();
    FakeSpeechRecognition.instances.at(-1)?.emitInterim('オラ');

    // isFinalを一度も送っていない時点で、既に予約されている。
    expect(timeoutCallbacks.size).toBe(1);
    runNextTimeout();
    expect(attackActions(actions)).toEqual([{ type: 'ATTACK', intensity: 1 }]);

    adapter.detach();
  });

  it('interimで反応した後、同じ発話がfinalへ確定しても二重に発火しない', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    nowMs = 1_000;
    rms = 0.2;
    runInterval();
    nowMs = 1_100;
    runInterval();
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    recognition.emitInterim('オラ');
    runNextTimeout();
    expect(attackActions(actions)).toHaveLength(1);

    // 同じresultIndex(既定の0)がfinalへ確定しても、既に消費済みなので無視する。
    recognition.emitFinal('オラ');
    expect(timeoutCallbacks.size).toBe(0);
    expect(attackActions(actions)).toHaveLength(1);

    adapter.detach();
  });

  it('interimがまだ何にもマッチしない間は、確定を待たず更新のたびに再評価する', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    completeCalibration();
    nowMs = 1_000;
    rms = 0.2;
    runInterval();
    nowMs = 1_100;
    runInterval();
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    // 最初の暫定結果はまだ断片で、キーワードとして成立しない。
    recognition.emitInterim('お');
    expect(timeoutCallbacks.size).toBe(0);

    // 続きが届いて「オラ」に育った時点で反応する。
    recognition.emitInterim('オラ');
    expect(timeoutCallbacks.size).toBe(1);
    runNextTimeout();
    expect(attackActions(actions)).toHaveLength(1);

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

  it('合掌を保持している間は一定間隔でREVIVEを送る', async () => {
    const actions: GameAction[] = [];
    const adapter = await createTestAttach()((action) => actions.push(action));

    runNextFrame(0);
    rms = 0.2;
    runInterval();
    nowMs = 350;
    rms = 0;
    runInterval();
    runNextFrame(1_000);

    detectedHands = {
      capturedAt: 1_001,
      left: hand(0.44, 0.55, false),
      right: hand(0.56, 0.55, false),
    };
    observedLeft = detectedHands.left;
    runNextFrame(1_001);
    runNextFrame(1_001 + ORA_REVIVE_INPUT_INTERVAL_MS - 1);
    runNextFrame(1_001 + ORA_REVIVE_INPUT_INTERVAL_MS);

    expect(actions.filter((action) => action.type === 'REVIVE')).toHaveLength(2);
    expect(
      actions
        .filter((action): action is Extract<GameAction, { type: 'MOVE' }> => action.type === 'MOVE')
        .every(({ input }) => input.forward === 0 && input.right === 0),
    ).toBe(true);
    adapter.detach();
  });

  it('no-speech等の一時的なエラーはstatusを壊さず、endから自動的に再開する', async () => {
    const statuses: OraProductionInputStatus[] = [];
    const adapter = await createTestAttach({ onStatusChange: (status) => statuses.push(status) })(
      () => undefined,
    );
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    expect(recognition.startCount).toBe(1);

    recognition.emitError('no-speech');
    recognition.emitEnd();

    expect(recognition.startCount).toBe(2);
    expect(statuses.some((status) => status.speechRecognition === 'error')).toBe(false);

    adapter.detach();
  });

  it('not-allowedはspeechRecognitionをerrorにし、endから再開を試みない', async () => {
    const statuses: OraProductionInputStatus[] = [];
    const adapter = await createTestAttach({ onStatusChange: (status) => statuses.push(status) })(
      () => undefined,
    );
    const recognition = FakeSpeechRecognition.instances.at(-1)!;

    recognition.emitError('not-allowed');
    recognition.emitEnd();

    expect(recognition.startCount).toBe(1);
    expect(
      statuses.some((status) => status.speechRecognition === 'error' && status.reason === 'error'),
    ).toBe(true);

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

  it('初期化の途中でsignalがabortされたら、その先へ進まず取得済みリソースを解放する', async () => {
    let resolveDetector: ((detector: unknown) => void) | undefined;
    mocks.createMediaPipeHandDetector.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetector = resolve;
        }),
    );
    const controller = new AbortController();

    const attachPromise = createTestAttach({ signal: controller.signal })(() => undefined);

    // Webcam・マイクは既に取得済みで、手検出モデルの読込待ちの間にキャラを
    // 切り替えた状況を再現する。
    await vi.waitFor(() => expect(resolveDetector).toBeDefined());
    controller.abort();
    resolveDetector?.({ detect: vi.fn<() => never>(), close: vi.fn<() => void>() });

    const adapter = await attachPromise;

    expect(mocks.stopWebcam).toHaveBeenCalledWith(cameraStream);
    expect(cameraTrack.stop).toHaveBeenCalledOnce();
    expect(audioTrack.stop).toHaveBeenCalledOnce();
    expect(FakeSpeechRecognition.instances).toHaveLength(0);
    expect(frameCallbacks.size).toBe(0);

    // 既に解放済みのアダプタを返す。detach()を呼んでも安全 (何もしない)。
    expect(() => adapter.detach()).not.toThrow();
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
