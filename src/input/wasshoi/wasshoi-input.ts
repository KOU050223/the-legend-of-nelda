import { createVoiceActivityDetector } from './voice-activity-detector';
import { createAdaptiveNoiseGate } from './adaptive-noise-gate';
import { playSystemWasshoi } from './system-wasshoi-engine';
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
  /** システム生成のわっしょーいを、許可済みのAudioContextから再生する。 */
  playWasshoi(event: WasshoiEvent): Promise<boolean>;
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
 * WasshoiEventだけを外へ出す。マイクの生音声は出力先へ接続・保存しない。
 */
export async function attachWasshoiInput(
  onEvent: (event: WasshoiEvent) => void,
  options: WasshoiInputOptions = {},
): Promise<WasshoiInputController> {
  const config = { ...DEFAULT_VOICE_ACTIVITY_CONFIG, ...options.config };
  const detector = createVoiceActivityDetector(config);
  const noiseGate = createAdaptiveNoiseGate(config.threshold);
  options.onStatusChange?.('requesting-permission');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (error) {
    options.onStatusChange?.(toStatus(error));
    throw error;
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timerId: number | null = null;
  let stopped = false;
  let lastEvent: WasshoiEvent | null = null;
  let nextWasshoiVariant = 0;

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
      noiseFloor: noiseGate.getNoiseFloor(),
      effectiveThreshold: detector.getThreshold(),
      lastEvent,
    });
  };

  const analyze = (): void => {
    if (stopped || analyser === null) return;
    try {
      analyser.getFloatTimeDomainData(samples);
      const nowMs = performance.now();
      const rms = rmsOf(samples);
      if (detector.getState() === 'silence') {
        detector.setThreshold(noiseGate.observeSilence(rms));
      }
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
    playWasshoi: (event) => {
      if (stopped) return Promise.resolve(false);
      const played = playSystemWasshoi(event, nextWasshoiVariant);
      nextWasshoiVariant += 1;
      return Promise.resolve(played);
    },
    stop: () => stop(),
  };
}
