import type {
  AttachInputAdapter,
  GameAction,
  GameActionListener,
  InputAdapter,
} from '@/game/types/game-action';
import {
  createWebAudioSession,
  type AudioAnalysisSession,
} from '@/input/microphone/microphone-adapter';
import { DEFAULT_VOICE_ACTIVITY_CONFIG } from '@/input/wasshoi/types';

import { createHandNeutralCalibrator } from './hand-calibration';
import { createMediaPipeHandDetector, type HandDetector } from './hand-detector';
import { createHandJoystick } from './hand-joystick';
import { createOraActionRecognizer } from './ora-action-recognizer';
import {
  createOraVoiceAttackRecognizer,
  type OraUtteranceCandidate,
} from './voice-attack-recognizer';
import type { HandObservation } from './types';
import { requestWebcam, stopWebcam } from './webcam';
import { createVoiceBaselineCalibrator } from './voice-calibration';

const ANALYSIS_INTERVAL_MS = 50;
const RMS_HISTORY_MS = 15_000;
// わっしょい用の大声前提スケールでは、通常発話がATTACKの下限へ届かない。
const ORA_SPEECH_INTENSITY_CEILING_RMS = 0.06;
const VOICE_ATTACK_HIT_SPACING_MS = 140;
const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    autoGainControl: true,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  },
};

type OraProductionInputPhase =
  | 'idle'
  | 'requesting-permission'
  | 'calibrating'
  | 'active'
  | 'error';
type SpeechRecognitionStatus = 'unknown' | 'available' | 'unavailable' | 'error';
type OraProductionInputReason = 'permission-denied' | 'unsupported' | 'error';

export interface OraProductionInputStatus {
  phase: OraProductionInputPhase;
  speechRecognition: SpeechRecognitionStatus;
  reason?: OraProductionInputReason;
  errorMessage?: string;
}

export interface OraCalibrationState {
  handComplete: boolean;
  voiceComplete: boolean;
  progress: number;
}

export interface OraHandTrackingFrame {
  left: HandObservation['left'];
  neutral: { x: number; y: number } | undefined;
}

/** 実機での音量ゲート・キーワード判定の切り分け用に、直近の発話判定結果を公開する。 */
export interface OraVoiceCandidateInfo {
  transcript: string;
  intensity: number;
  hits: number;
}

export interface OraProductionInputOptions {
  onStatusChange?: (status: OraProductionInputStatus) => void;
  onCalibrationChange?: (state: OraCalibrationState) => void;
  onHandTrackingFrame?: (frame: OraHandTrackingFrame) => void;
  onVoiceCandidate?: (info: OraVoiceCandidateInfo) => void;
  /** テストでブラウザの時間・スケジューラを差し替える。 */
  now?: () => number;
  requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
  setInterval?: (handler: () => void, milliseconds: number) => number;
  clearInterval?: (id: number) => void;
  setTimeout?: (handler: () => void, milliseconds: number) => number;
  clearTimeout?: (id: number) => void;
}

interface SpeechResult {
  isFinal: boolean;
  0?: { transcript?: string };
}

interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult | undefined;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: SpeechResultList;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  addEventListener(type: 'result', listener: (event: SpeechRecognitionResultEvent) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
  addEventListener(type: 'end', listener: () => void): void;
  removeEventListener(
    type: 'result',
    listener: (event: SpeechRecognitionResultEvent) => void,
  ): void;
  removeEventListener(type: 'error', listener: () => void): void;
  removeEventListener(type: 'end', listener: () => void): void;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function rmsOf(samples: Float32Array<ArrayBuffer>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reasonOf(error: unknown): OraProductionInputReason {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return 'permission-denied';
  }
  return 'error';
}

function createMicrophoneRequest(): Promise<MediaStream> {
  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices?.getUserMedia === undefined) {
    return Promise.reject(new Error('このブラウザはマイク入力に対応していません。'));
  }
  return mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
}

function clampIntensity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeOraSpeechIntensity(peakRms: number): number {
  const threshold = DEFAULT_VOICE_ACTIVITY_CONFIG.threshold;
  if (peakRms <= threshold) return 0;
  return clampIntensity((peakRms - threshold) / (ORA_SPEECH_INTENSITY_CEILING_RMS - threshold));
}

/**
 * カメラ・マイクをGameActionへ変換する本番入力境界。
 * 生のMediaStream、PCM、SpeechRecognition結果はこの関数の外へ出さない。
 */
export async function attachOraProductionInput(
  onValue: GameActionListener,
  options: OraProductionInputOptions = {},
): Promise<InputAdapter> {
  const now = options.now ?? (() => performance.now());
  const scheduleFrame =
    options.requestAnimationFrame ??
    ((callback: (timestamp: number) => void) => window.requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelAnimationFrame ?? ((id: number) => window.cancelAnimationFrame(id));
  const startInterval =
    options.setInterval ??
    ((handler: () => void, milliseconds: number) => window.setInterval(handler, milliseconds));
  const stopInterval = options.clearInterval ?? ((id: number) => window.clearInterval(id));
  const startTimeout =
    options.setTimeout ??
    ((handler: () => void, milliseconds: number) => window.setTimeout(handler, milliseconds));
  const stopTimeout = options.clearTimeout ?? ((id: number) => window.clearTimeout(id));

  const handCalibrator = createHandNeutralCalibrator();
  const voiceCalibrator = createVoiceBaselineCalibrator();
  const joystick = createHandJoystick();
  const oraActionRecognizer = createOraActionRecognizer();
  const voiceAttackRecognizer = createOraVoiceAttackRecognizer();

  let phase: OraProductionInputPhase = 'idle';
  let speechRecognitionStatus: SpeechRecognitionStatus = 'unknown';
  let reason: OraProductionInputReason | undefined;
  let errorMessage: string | undefined;
  let lastCalibrationKey = '';
  let calibrationWasComplete = false;

  let webcamStream: MediaStream | undefined;
  let microphoneStream: MediaStream | undefined;
  let handDetector: HandDetector | undefined;
  let audioSession: AudioAnalysisSession | undefined;
  let video: HTMLVideoElement | undefined;
  let recognition: SpeechRecognitionLike | undefined;
  let speechResultListener: ((event: SpeechRecognitionResultEvent) => void) | undefined;
  let speechErrorListener: (() => void) | undefined;
  let speechEndListener: (() => void) | undefined;
  let frameId: number | undefined;
  let intervalId: number | undefined;
  let stopped = false;
  const pendingAttackTimeoutIds = new Set<number>();

  const rmsHistory: Array<{ at: number; rms: number }> = [];
  let speechStartedAt: number | null = null;
  let lastVoicedAt: number | null = null;
  let previousSpeechStartedAt: number | null = null;

  const notifyStatus = (nextPhase: OraProductionInputPhase): void => {
    phase = nextPhase;
    const status: OraProductionInputStatus = {
      phase,
      speechRecognition: speechRecognitionStatus,
      ...(reason === undefined ? {} : { reason }),
      ...(errorMessage === undefined ? {} : { errorMessage }),
    };
    try {
      options.onStatusChange?.(status);
    } catch {
      // 状態表示側の例外で入力リソースの解放を止めない。
    }
  };

  const notifyCalibration = (): OraCalibrationState => {
    const state: OraCalibrationState = {
      handComplete: handCalibrator.isComplete(),
      voiceComplete: voiceCalibrator.isComplete(),
      progress: (Number(handCalibrator.isComplete()) + Number(voiceCalibrator.isComplete())) / 2,
    };
    const key = `${state.handComplete}:${state.voiceComplete}`;
    if (key !== lastCalibrationKey) {
      lastCalibrationKey = key;
      try {
        options.onCalibrationChange?.(state);
      } catch {
        // 状態表示側の例外で入力処理を止めない。
      }
    }
    const complete = state.handComplete && state.voiceComplete;
    if (complete !== calibrationWasComplete) {
      calibrationWasComplete = complete;
      notifyStatus(complete ? 'active' : 'calibrating');
    }
    return state;
  };

  const notifyHandTrackingFrame = (frame: OraHandTrackingFrame): void => {
    try {
      options.onHandTrackingFrame?.(frame);
    } catch {
      // 表示側の例外で手入力の処理を止めない。
    }
  };

  const notifyVoiceCandidate = (info: OraVoiceCandidateInfo): void => {
    try {
      options.onVoiceCandidate?.(info);
    } catch {
      // 表示側の例外で音声処理を止めない。
    }
  };

  const setSpeechRecognitionStatus = (
    nextStatus: SpeechRecognitionStatus,
    nextReason?: OraProductionInputReason,
    nextErrorMessage?: string,
  ): void => {
    speechRecognitionStatus = nextStatus;
    if (nextReason !== undefined) reason = nextReason;
    if (nextErrorMessage !== undefined) errorMessage = nextErrorMessage;
    notifyStatus(phase);
  };

  const teardown = (): void => {
    if (stopped) return;
    stopped = true;

    if (intervalId !== undefined) stopInterval(intervalId);
    if (frameId !== undefined) cancelFrame(frameId);
    for (const timeoutId of pendingAttackTimeoutIds) {
      try {
        stopTimeout(timeoutId);
      } catch {
        // 1つのタイマー取消し失敗で、他の予約ATTACKを残さない。
      }
    }
    pendingAttackTimeoutIds.clear();

    if (recognition !== undefined) {
      if (speechResultListener !== undefined) {
        recognition.removeEventListener('result', speechResultListener);
      }
      if (speechErrorListener !== undefined)
        recognition.removeEventListener('error', speechErrorListener);
      if (speechEndListener !== undefined)
        recognition.removeEventListener('end', speechEndListener);
      try {
        recognition.stop();
      } catch {
        // 既に停止したSpeechRecognitionの例外は解放を妨げない。
      }
    }

    try {
      audioSession?.dispose();
    } catch {
      // AudioContextの終了失敗時も下のTrack停止を続ける。
    }
    microphoneStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // 1本のTrack停止失敗で他のTrackを残さない。
      }
    });
    try {
      handDetector?.close();
    } catch {
      // モデルのclose失敗時もカメラを解放する。
    }
    if (video !== undefined) {
      video.pause();
      video.srcObject = null;
    }
    stopWebcam(webcamStream);
  };

  const reportError = (error: unknown, nextReason: OraProductionInputReason = 'error'): void => {
    reason = nextReason;
    errorMessage = messageOf(error);
    teardown();
    notifyStatus('error');
  };

  const emit = (action: GameAction): void => {
    if (stopped) return;
    try {
      onValue(action);
    } catch (error) {
      reportError(error);
    }
  };

  const scheduleAttack = (delayMs: number): void => {
    if (stopped) return;
    let timeoutId: number | undefined;
    try {
      timeoutId = startTimeout(() => {
        if (timeoutId !== undefined) pendingAttackTimeoutIds.delete(timeoutId);
        emit({ type: 'ATTACK' });
      }, delayMs);
      pendingAttackTimeoutIds.add(timeoutId);
    } catch (error) {
      reportError(error);
    }
  };

  const recordRms = (rms: number, timestamp: number): void => {
    rmsHistory.push({ at: timestamp, rms });
    const oldestAllowed = timestamp - RMS_HISTORY_MS;
    while (rmsHistory[0] !== undefined && rmsHistory[0].at < oldestAllowed) {
      rmsHistory.shift();
    }

    voiceCalibrator.observeRms(rms, timestamp);
    const threshold = DEFAULT_VOICE_ACTIVITY_CONFIG.threshold;
    if (rms >= threshold) {
      speechStartedAt ??= timestamp;
      lastVoicedAt = timestamp;
      return;
    }

    if (
      speechStartedAt !== null &&
      lastVoicedAt !== null &&
      timestamp - lastVoicedAt >= DEFAULT_VOICE_ACTIVITY_CONFIG.hangoverMs
    ) {
      previousSpeechStartedAt = speechStartedAt;
      speechStartedAt = null;
      lastVoicedAt = null;
    }
  };

  const intensityBetween = (startedAt: number, endedAt: number): number => {
    let peakRms = 0;
    for (const sample of rmsHistory) {
      if (sample.at >= startedAt && sample.at <= endedAt) peakRms = Math.max(peakRms, sample.rms);
    }
    return normalizeOraSpeechIntensity(peakRms);
  };

  const handleSpeechResult = (event: SpeechRecognitionResultEvent): void => {
    if (stopped) return;
    const endedAt = now();
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.isFinal) continue;
      const transcript = result[0]?.transcript?.trim();
      if (!transcript) continue;

      const startedAt = Math.min(
        endedAt,
        speechStartedAt ?? previousSpeechStartedAt ?? Math.max(0, endedAt - 1_000),
      );
      const candidate: OraUtteranceCandidate = {
        transcript,
        startedAt,
        endedAt,
        intensity: intensityBetween(startedAt, endedAt),
      };
      // Calibration未完了でも認識結果自体は公開する。「音声認識が拾えていない」
      // のか「Calibration待ちで止めている」のかを実機で切り分けるため。
      const calibrated = handCalibrator.isComplete() && voiceCalibrator.isComplete();
      const attacks = calibrated ? voiceAttackRecognizer.recognize(candidate) : [];
      if (import.meta.env.DEV) {
        console.debug('[ora] voice candidate', {
          transcript: candidate.transcript,
          intensity: candidate.intensity,
          hits: attacks.length,
          calibrated,
        });
      }
      notifyVoiceCandidate({
        transcript: candidate.transcript,
        intensity: candidate.intensity,
        hits: attacks.length,
      });
      if (!calibrated) continue;

      for (let attackIndex = 0; attackIndex < attacks.length; attackIndex += 1) {
        scheduleAttack(attackIndex * VOICE_ATTACK_HIT_SPACING_MS);
      }
    }
  };

  const startSpeechRecognition = (): void => {
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (Recognition === undefined) {
      setSpeechRecognitionStatus(
        'unavailable',
        'unsupported',
        'SpeechRecognitionに対応していません。',
      );
      return;
    }

    speechRecognitionStatus = 'available';
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'ja-JP';
    speechResultListener = handleSpeechResult;
    speechErrorListener = () => {
      setSpeechRecognitionStatus(
        'error',
        'error',
        'SpeechRecognitionの開始後にエラーが発生しました。',
      );
    };
    speechEndListener = () => {
      if (stopped || recognition === undefined || speechRecognitionStatus !== 'available') return;
      try {
        recognition.start();
      } catch (error) {
        setSpeechRecognitionStatus('error', 'error', messageOf(error));
      }
    };
    recognition.addEventListener('result', speechResultListener);
    recognition.addEventListener('error', speechErrorListener);
    recognition.addEventListener('end', speechEndListener);
    try {
      recognition.start();
    } catch (error) {
      setSpeechRecognitionStatus('error', 'error', messageOf(error));
    }
  };

  const analyzeAudio = (): void => {
    if (stopped || audioSession === undefined) return;
    try {
      const samples = new Float32Array(
        new ArrayBuffer(audioSession.frameSize * Float32Array.BYTES_PER_ELEMENT),
      );
      audioSession.readFrame(samples);
      recordRms(rmsOf(samples), now());
      notifyCalibration();
    } catch (error) {
      reportError(error);
    }
  };

  const processFrame = (timestamp: number): void => {
    if (stopped || handDetector === undefined || video === undefined) return;
    try {
      const observation = handDetector.detect(video, timestamp);
      handCalibrator.sample(observation.left, timestamp);
      const neutral = handCalibrator.getNeutral();
      notifyHandTrackingFrame({ left: observation.left, neutral });
      const calibration = notifyCalibration();
      if (!calibration.handComplete || !calibration.voiceComplete) {
        joystick.reset();
        oraActionRecognizer.reset();
        voiceAttackRecognizer.reset();
        return;
      }

      emit({ type: 'MOVE', input: joystick.update(observation.left, neutral, timestamp) });
      const oraState = oraActionRecognizer.update(observation.left, observation.right, timestamp);
      if (oraState.triggered) emit({ type: 'CHARACTER_ACTION' });
    } catch (error) {
      reportError(error);
    }
  };

  const frameLoop = (timestamp: number): void => {
    if (stopped) return;
    frameId = scheduleFrame(frameLoop);
    processFrame(timestamp);
  };

  notifyCalibration();
  notifyStatus('requesting-permission');
  try {
    webcamStream = await requestWebcam();
    microphoneStream = await createMicrophoneRequest();
    handDetector = await createMediaPipeHandDetector();

    video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = webcamStream;
    await video.play();

    audioSession = await createWebAudioSession(microphoneStream);
    startSpeechRecognition();
    notifyStatus('calibrating');
    intervalId = startInterval(analyzeAudio, ANALYSIS_INTERVAL_MS);
    frameId = scheduleFrame(frameLoop);
  } catch (error) {
    const nextReason = reasonOf(error);
    teardown();
    reason = nextReason;
    errorMessage = messageOf(error);
    notifyStatus('error');
    throw error;
  }

  return {
    detach() {
      teardown();
      notifyStatus('idle');
    },
  };
}

export function createOraProductionInput(
  options: OraProductionInputOptions = {},
): AttachInputAdapter {
  return (onValue) => attachOraProductionInput(onValue, options);
}
