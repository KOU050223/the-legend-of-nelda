import type { GameClock } from '@/game/clock';
import { createRealClock } from '@/game/clock';

import { createNoteStabilizer, isAcceptableFrame } from './note-stabilizer';
import type { PitchDetector } from './pitch-detector';
import { createPitchyDetector } from './pitch-detector';
import type {
  MicrophoneInputStatus,
  NoteEventListener,
  PitchFrame,
  PitchInputConfig,
} from './types';
import { DEFAULT_PITCH_INPUT_CONFIG } from './types';

/**
 * Pitch 検出に使う窓長。2048 サンプル。
 * 48kHz で約 43ms 分あり、下限 200Hz の周期を複数含められる。
 */
const FFT_SIZE = 2048;

/** 解析間隔。33ms ≒ 30fps。stableFrames=3 で約100msの確定遅延。 */
const ANALYSIS_INTERVAL_MS = 33;

/**
 * 可能な限り加工されていない音を要求する。Pitch 検出では
 * ノイズ抑制やAGCが倍音を壊し、かえって検出を不安定にする。
 */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  // ideal にするのは、完全一致で要求すると対応しない機器で OverconstrainedError
  // になり、マイクがあるのに「デバイス無し」として扱われてしまうため。
  // 無視された場合は getSettings() の実値を受け入れる。
  channelCount: { ideal: 1 },
  echoCancellation: { ideal: false },
  noiseSuppression: { ideal: false },
  autoGainControl: { ideal: false },
};

/**
 * Adapter が実際に使う分だけを要求する。MediaStream / AudioContext 全体を
 * 要求すると、テストから差し替えるのに巨大な偽物か型アサーションが必要になる。
 */
export interface AudioInputTrack {
  stop(): void;
  getSettings(): MediaTrackSettings;
}

export interface AudioInputStream {
  getTracks(): readonly AudioInputTrack[];
  getAudioTracks(): readonly AudioInputTrack[];
}

/**
 * マイク → Analyser の結線と後始末をまとめたもの。
 *
 * ノードを個別に公開せず 1 つの口にしているのは、呼び出し側が
 * AudioNode の型に縛られず差し替えられるようにするため。
 */
export interface AudioAnalysisSession {
  readonly sampleRate: number;
  /** 解析用の時間波形を取り出す。 */
  readFrame(samples: Float32Array<ArrayBuffer>): void;
  /** 窓長。Float32Array の確保に使う。 */
  readonly frameSize: number;
  /** ノード切断と AudioContext の後始末。 */
  dispose(): void;
}

export type AudioAnalysisSessionFactory = (
  stream: AudioInputStream,
) => AudioAnalysisSession | Promise<AudioAnalysisSession>;

/**
 * createMediaStreamSource は本物の MediaStream を要求する。型だけ絞った
 * AudioInputStream から元の形へ戻すのはこの一箇所に閉じ込める。
 */
function toMediaStream(stream: AudioInputStream): MediaStream {
  if (stream instanceof MediaStream) return stream;
  throw new TypeError('Web Audio には本物の MediaStream が必要');
}

/**
 * この Adapter が AudioContext へ求める範囲。全体を要求するとテストから
 * 差し替えるのに巨大な偽物か型アサーションが必要になる。
 */
/** 解析ノード。Adapter が触るのは窓長・波形取得・切断だけ。 */
export interface AnalysisNode {
  fftSize: number;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
  disconnect(): void;
}

/**
 * Adapter が AudioContext へ求める範囲。
 *
 * マイクと解析ノードの結線まで context 側の責務にしているのは、
 * source ノードを型として公開すると connect の引数が反変になり、
 * 本物の AudioNode でもテスト用の偽物でも型が合わなくなるため。
 */
export interface AnalysisAudioContext {
  readonly state: AudioContextState;
  readonly sampleRate: number;
  resume(): Promise<void>;
  /** マイクを解析ノードへ繋ぎ、解析ノードと切断処理を返す。 */
  connectMicrophone(
    stream: MediaStream,
    fftSize: number,
  ): {
    analyser: AnalysisNode;
    disconnect(): void;
  };
  close(): Promise<void>;
}

/** 本物の AudioContext を、この Adapter が使う形として見せる。 */
export function toAnalysisContext(context: AudioContext): AnalysisAudioContext {
  return {
    get state() {
      return context.state;
    },
    get sampleRate() {
      return context.sampleRate;
    },
    resume: () => context.resume(),
    connectMicrophone(stream, fftSize) {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      // destination へは繋がない。繋ぐとマイク音がそのまま再生されハウリングする。
      source.connect(analyser);

      return {
        analyser,
        disconnect() {
          source.disconnect();
          analyser.disconnect();
        },
      };
    },
    close: () => context.close(),
  };
}

/** jsdom には AudioContext が無いため、生成だけ差し替えられるようにする。 */
export type AudioContextFactory = () => AnalysisAudioContext;

/** 本物の Web Audio で解析セッションを組む。 */
export async function createWebAudioSession(
  stream: AudioInputStream,
  createContext: AudioContextFactory = () => toAnalysisContext(new AudioContext()),
): Promise<AudioAnalysisSession> {
  const context = createContext();

  try {
    // getUserMedia の await でユーザー操作のスタックから外れるため、suspended の
    // まま始まることがある。その状態だと getFloatTimeDomainData が常に無音を返し、
    // 「エラーも出ないのに反応しない」状態になるので、再開できたかまで確かめる。
    if (context.state === 'suspended') {
      await context.resume();
    }

    // iOS Safari などでは resume が拒否されたまま解決することがある。
    if (context.state !== 'running') {
      throw new Error(`AudioContext を再開できない (state=${context.state})`);
    }

    const microphone = context.connectMicrophone(toMediaStream(stream), FFT_SIZE);
    const analyser = microphone.analyser;

    return {
      sampleRate: context.sampleRate,
      frameSize: analyser.fftSize,
      readFrame(samples) {
        analyser.getFloatTimeDomainData(samples);
      },
      dispose() {
        microphone.disconnect();
        // 二重 close などで reject しても、停止処理としては done 扱いでよい。
        context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    // 組み立てに失敗した AudioContext を放置しない。再試行のたびに増えると
    // ブラウザ側の上限に達して、以降マイクを開けなくなる。
    context.close().catch(() => undefined);
    throw error;
  }
}

/** Debug UI へ現在値を流すためのフック。ゲーム本体は購読しない。 */
export interface MicrophoneDebugSnapshot {
  /** 棄却されたものも含む生フレーム。無音なら null。 */
  frame: PitchFrame | null;
  /** 閾値を満たしたか。 */
  accepted: boolean;
  /** 実際に適用された MediaTrack 設定。 */
  trackSettings: MediaTrackSettings | null;
}

export interface MicrophoneAdapterOptions {
  config?: Partial<PitchInputConfig>;
  clock?: GameClock;
  detector?: PitchDetector;
  /** テストから差し替えられるよう、navigator を直接見ない。 */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<AudioInputStream>;
  createSession?: AudioAnalysisSessionFactory;
  onStatusChange?: (status: MicrophoneInputStatus) => void;
  onDebug?: (snapshot: MicrophoneDebugSnapshot) => void;
  /** ポーリング用。テストでは同期的に進められるものを渡す。 */
  setInterval?: (handler: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
}

/** getUserMedia の失敗理由を、扱える状態へ寄せる。 */
function toStatus(error: unknown): MicrophoneInputStatus {
  if (!(error instanceof Error)) return 'error';

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'device-not-found';
    default:
      return 'error';
  }
}

/**
 * マイク入力を NoteEvent へ変換する Input Adapter。(Issue #43)
 *
 * Keyboard Adapter と同じく、ブラウザ固有 API を呼び出し側へ漏らさない。
 * Game Logic へ MediaStream / AudioContext / PCM は渡らず、NoteEvent だけが出ていく。
 * (docs/technical-design.md §5.2)
 *
 * マイク許可はユーザー操作から呼ぶこと。Secure Context (HTTPS / localhost) 前提。
 *
 * @returns 購読解除関数。polling 停止・ノード切断・Track停止・AudioContext close を行う
 */
export async function attachMicrophoneNoteInput(
  onNote: NoteEventListener,
  options: MicrophoneAdapterOptions = {},
): Promise<() => void> {
  const config: PitchInputConfig = { ...DEFAULT_PITCH_INPUT_CONFIG, ...options.config };
  const clock = options.clock ?? createRealClock();
  const detector = options.detector ?? createPitchyDetector();
  const onStatusChange = options.onStatusChange;
  const onDebug = options.onDebug;
  const startTimer = options.setInterval ?? ((handler, ms) => window.setInterval(handler, ms));
  const stopTimer =
    options.clearInterval ??
    ((id) => {
      window.clearInterval(id);
    });

  const requestMedia =
    options.getUserMedia ??
    ((constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints));

  onStatusChange?.('requesting-permission');

  let stream: AudioInputStream;
  try {
    stream = await requestMedia({ audio: AUDIO_CONSTRAINTS });
  } catch (error) {
    onStatusChange?.(toStatus(error));
    throw error;
  }

  const stopStream = (): void => {
    for (const track of stream.getTracks()) track.stop();
  };

  let session: AudioAnalysisSession;
  try {
    session = await (options.createSession ?? createWebAudioSession)(stream);
  } catch (error) {
    // 解析を組めなければマイクを掴んだままにしない。
    stopStream();
    onStatusChange?.('error');
    throw error;
  }

  const samples = new Float32Array(
    new ArrayBuffer(session.frameSize * Float32Array.BYTES_PER_ELEMENT),
  );
  const stabilizer = createNoteStabilizer(config);

  // Constraint が無視される環境があるため、要求値ではなく実値を Debug UI へ出す。
  const trackSettings = stream.getAudioTracks()[0]?.getSettings() ?? null;

  const analyze = (): void => {
    // 解析やリスナーが投げても 33ms ごとに例外を出し続けない。
    try {
      analyzeFrame();
    } catch (error) {
      onDebug?.({ frame: null, accepted: false, trackSettings });
      console.error('マイク入力の解析に失敗', error);
    }
  };

  const analyzeFrame = (): void => {
    session.readFrame(samples);

    const nowMs = clock.now();
    const frame = detector.detect(samples, session.sampleRate, nowMs);
    const accepted = frame !== null && isAcceptableFrame(frame, config);

    onDebug?.({ frame, accepted, trackSettings });

    // 棄却フレームは捨てずに null として渡す。ここで握りつぶすと
    // note-off の猶予時間が進まず、鳴り止んでも note-off が出ない。
    const event = stabilizer.update(accepted ? frame : null, nowMs);
    if (event !== null) onNote(event);
  };

  const timerId = startTimer(analyze, ANALYSIS_INTERVAL_MS);
  onStatusChange?.('active');

  let stopped = false;
  return () => {
    // 二重呼び出しでも Track を止め直したり close を二度呼んだりしない。
    if (stopped) return;
    stopped = true;

    stopTimer(timerId);

    // 鳴ったままの音を note-on の出しっぱなしで終わらせない。購読側が
    // 「今鳴っている音」を持つ場合、対の note-off が無いと停止後も残る。
    const sounding = stabilizer.getStableNote();

    // 後始末の失敗で停止処理そのものを止めない。ここで例外を伝播させると
    // マイク解放も note-off も idle 通知も飛ばしてしまう。
    try {
      session.dispose();
    } catch {
      // 解放できないノードは諦める。マイクの停止を優先する。
    }

    stopStream();
    stabilizer.reset();
    onStatusChange?.('idle');

    if (sounding !== null) onNote({ type: 'note-off', note: sounding });
  };
}
