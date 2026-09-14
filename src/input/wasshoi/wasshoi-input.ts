import { createVoiceActivityDetector } from './voice-activity-detector';
import {
  DEFAULT_VOICE_ACTIVITY_CONFIG,
  type VoiceActivityConfig,
  type WasshoiDebugSnapshot,
  type WasshoiEvent,
} from './types';

export type WasshoiInputStatus =
  | 'idle'
  | 'requesting-permission'
  | 'active'
  | 'permission-denied'
  | 'error';

export interface WasshoiInputController {
  startRecording(): void;
  stopRecording(): Promise<Blob>;
  isRecording(): boolean;
  /** 録音済みの本人Sampleを、許可済みのAudioContextから再生する。 */
  playRecordedSample(event: WasshoiEvent): Promise<boolean>;
  stop(): void;
}

export interface WasshoiInputOptions {
  config?: Partial<VoiceActivityConfig>;
  onStatusChange?: (status: WasshoiInputStatus) => void;
  onDebug?: (snapshot: WasshoiDebugSnapshot) => void;
}

const ANALYSIS_INTERVAL_MS = 50;
const FFT_SIZE = 2048;

function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function toStatus(error: unknown): WasshoiInputStatus {
  if (
    error instanceof Error &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return 'permission-denied';
  }
  return 'error';
}

/**
 * Pay大輔用のマイク入力。生音声を出力先へconnectせず、RMSから作った
 * WasshoiEventだけを外へ出す。録音したSampleも現在のブラウザセッションだけに保持する。
 */
export async function attachWasshoiInput(
  onEvent: (event: WasshoiEvent) => void,
  options: WasshoiInputOptions = {},
): Promise<WasshoiInputController> {
  const config = { ...DEFAULT_VOICE_ACTIVITY_CONFIG, ...options.config };
  const detector = createVoiceActivityDetector(config);
  options.onStatusChange?.('requesting-permission');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    options.onStatusChange?.(toStatus(error));
    throw error;
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timerId: number | null = null;
  let recorder: MediaRecorder | null = null;
  let recordingResult: Promise<Blob> | null = null;
  let recordedSample: AudioBuffer | null = null;
  let stopped = false;
  let lastEvent: WasshoiEvent | null = null;

  try {
    context = new AudioContext();
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running')
      throw new Error(`AudioContext を再開できない (state=${context.state})`);

    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser);
  } catch (error) {
    source?.disconnect();
    analyser?.disconnect();
    context?.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    options.onStatusChange?.('error');
    throw error;
  }

  const samples = new Float32Array(analyser.fftSize);
  const publishDebug = (nowMs: number, rms: number): void => {
    options.onDebug?.({
      state: detector.getState(),
      rms,
      durationMs: detector.getDurationMs(nowMs),
      intensity: detector.getIntensity(),
      lastEvent,
    });
  };

  const analyze = (): void => {
    if (stopped || analyser === null) return;
    try {
      analyser.getFloatTimeDomainData(samples);
      const nowMs = performance.now();
      const rms = rmsOf(samples);
      const event = detector.update(rms, nowMs);
      if (event !== null) {
        lastEvent = event;
        onEvent(event);
      }
      publishDebug(nowMs, rms);
    } catch (error) {
      console.error('わっしょーい入力の解析に失敗', error);
      stop('error');
    }
  };

  const stop = (finalStatus: WasshoiInputStatus = 'idle'): void => {
    if (stopped) return;
    stopped = true;
    if (timerId !== null) window.clearInterval(timerId);
    if (recorder?.state === 'recording') recorder.stop();

    const finalEvent = detector.reset();
    if (finalEvent !== null) onEvent(finalEvent);
    source?.disconnect();
    analyser?.disconnect();
    context?.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    options.onStatusChange?.(finalStatus);
  };

  timerId = window.setInterval(analyze, ANALYSIS_INTERVAL_MS);
  options.onStatusChange?.('active');

  return {
    startRecording() {
      if (stopped) throw new Error('マイク入力が停止しています');
      if (recorder?.state === 'recording') return;
      if (typeof MediaRecorder === 'undefined')
        throw new Error('このブラウザは録音に対応していません');

      const chunks: BlobPart[] = [];
      const activeRecorder = new MediaRecorder(stream);
      recorder = activeRecorder;
      recordingResult = new Promise<Blob>((resolve, reject) => {
        activeRecorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
        activeRecorder.addEventListener('error', () =>
          reject(new Error('わっしょーい録音に失敗しました')),
        );
        activeRecorder.addEventListener('stop', () =>
          resolve(new Blob(chunks, { type: activeRecorder.mimeType || 'audio/webm' })),
        );
      });
      activeRecorder.start();
    },
    async stopRecording() {
      if (recorder?.state !== 'recording' || recordingResult === null) {
        throw new Error('録音を開始していません');
      }
      recorder.stop();
      const blob = await recordingResult;
      // audio要素のplay()はタイマー起点だと自動再生制限に止められることがある。
      // マイク許可時に開始済みのAudioContextへデコードしておけば、発話終了時にも
      // 確実に「わっしょーい」を鳴らせる。
      recordedSample = await context.decodeAudioData(await blob.arrayBuffer());
      return blob;
    },
    isRecording: () => recorder?.state === 'recording',
    async playRecordedSample(event) {
      if (stopped || recordedSample === null) return false;
      try {
        // 入力だけを解析している間、ブラウザがContextをsuspendすることがある。
        // 再生直前に再開してからBufferSourceを作ることで、発話終了後にも鳴らす。
        if (context.state === 'suspended') await context.resume();
        if (context.state !== 'running') return false;

        const sourceNode = context.createBufferSource();
        const gainNode = context.createGain();
        sourceNode.buffer = recordedSample;
        gainNode.gain.value = 0.15 + event.intensity * 0.85;
        // 長い発話ほどゆっくり、短い発話ほど速くする。内容は一切反映しない。
        sourceNode.playbackRate.value = Math.min(
          1.6,
          Math.max(0.65, 700 / Math.max(250, event.durationMs)),
        );
        sourceNode.connect(gainNode);
        gainNode.connect(context.destination);
        sourceNode.start();
        return true;
      } catch (error) {
        console.error('録音済みわっしょーいの再生に失敗', error);
        return false;
      }
    },
    stop: () => stop(),
  };
}
