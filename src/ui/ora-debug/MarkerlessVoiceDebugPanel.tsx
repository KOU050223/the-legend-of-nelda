import { useCallback, useEffect, useRef, useState } from 'react';

import { createHandNeutralCalibrator } from '@/input/ora/hand-calibration';
import { createMediaPipeHandDetector, type HandDetector } from '@/input/ora/hand-detector';
import { createHandJoystick } from '@/input/ora/hand-joystick';
import { createOraActionRecognizer, type OraActionState } from '@/input/ora/ora-action-recognizer';
import {
  createOraVoiceAttackRecognizer,
  type OraVoiceAttackEvent,
  type OraUtteranceCandidate,
} from '@/input/ora/voice-attack-recognizer';
import type { HandObservation } from '@/input/ora/types';
import { requestWebcam, stopWebcam } from '@/input/ora/webcam';
import type { MovementInput } from '@/game/movement/types';
import { createVoiceBaselineCalibrator } from '@/input/ora/voice-calibration';
import { createVoiceActivityDetector } from '@/input/wasshoi/voice-activity-detector';
import { DEFAULT_VOICE_ACTIVITY_CONFIG, type VoiceActivityState } from '@/input/wasshoi/types';

import {
  classifyMarkerlessMediaError,
  formatMarkerlessHand,
  labelForMarkerlessMediaStatus,
  rmsFromSamples,
} from './markerless-debug-helpers';
import type { MarkerlessMediaStatus } from './markerless-debug-helpers';
import styles from './OraDebugPage.module.css';

const FFT_SIZE = 2_048;
const ANALYSIS_INTERVAL_MS = 50;
const RUSH_WINDOW_MS = 1_200;

const emptyHandObservation: HandObservation = { capturedAt: 0 };
const emptyMovement: MovementInput = { forward: 0, right: 0 };
const emptyOraAction: OraActionState = {
  progress: 0,
  isHolding: false,
  triggered: false,
};

interface VoiceUtteranceWindow {
  startedAt: number;
  endedAt: number;
  intensity: number;
}

interface VoiceCalibrationSnapshot {
  complete: boolean;
  intensity: number | undefined;
}

type SpeechRecognitionStatus = 'idle' | 'active' | 'unsupported' | 'error';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionResultListLike {
  length: number;
  readonly [index: number]: SpeechRecognitionResultLike | undefined;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  webkitAudioContext?: typeof AudioContext;
};

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const browserWindow = window as WindowWithSpeechRecognition;
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
}

function isSpeechRecognitionEvent(event: Event): event is SpeechRecognitionEventLike {
  return 'resultIndex' in event && 'results' in event;
}

/** Phase1〜4のMarkerless入力状態だけを表示する、ARマーカーPoCから独立したパネル。 */
export function MarkerlessVoiceDebugPanel(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | undefined>(undefined);
  const cameraDetectorRef = useRef<HandDetector | undefined>(undefined);
  const cameraFrameRef = useRef<number | undefined>(undefined);
  const cameraSessionRef = useRef(0);
  const cameraBusyRef = useRef(false);

  const microphoneStreamRef = useRef<MediaStream | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const analyserRef = useRef<AnalyserNode | undefined>(undefined);
  const audioSamplesRef = useRef<Float32Array | undefined>(undefined);
  const audioTimerRef = useRef<number | undefined>(undefined);
  const microphoneSessionRef = useRef(0);
  const microphoneBusyRef = useRef(false);

  const speechRecognitionRef = useRef<SpeechRecognitionLike | undefined>(undefined);
  const [handCalibrator] = useState(() => createHandNeutralCalibrator());
  const [voiceCalibrator] = useState(() => createVoiceBaselineCalibrator());
  const [voiceActivity] = useState(() =>
    createVoiceActivityDetector(DEFAULT_VOICE_ACTIVITY_CONFIG),
  );
  const [handJoystick] = useState(() => createHandJoystick());
  const [oraActionRecognizer] = useState(() => createOraActionRecognizer());
  const [voiceAttack] = useState(() => createOraVoiceAttackRecognizer());
  const calibrationActiveRef = useRef(false);
  const voiceStartRef = useRef<number | undefined>(undefined);
  const lastVoiceWindowRef = useRef<VoiceUtteranceWindow | undefined>(undefined);
  const lastRmsRef = useRef(0);
  const voiceHitTimesRef = useRef<number[]>([]);

  const [cameraStatus, setCameraStatus] = useState<MarkerlessMediaStatus>('idle');
  const [cameraError, setCameraError] = useState<string>();
  const [microphoneStatus, setMicrophoneStatus] = useState<MarkerlessMediaStatus>('idle');
  const [microphoneError, setMicrophoneError] = useState<string>();
  const [speechStatus, setSpeechStatus] = useState<SpeechRecognitionStatus>(() =>
    getSpeechRecognitionConstructor() ? 'idle' : 'unsupported',
  );
  const [speechError, setSpeechError] = useState<string>();
  const [handObservation, setHandObservation] = useState<HandObservation>(emptyHandObservation);
  const [neutral, setNeutral] = useState<{ x: number; y: number }>();
  const [movement, setMovement] = useState<MovementInput>(emptyMovement);
  const [oraAction, setOraAction] = useState<OraActionState>(emptyOraAction);
  const [lastOraActionAt, setLastOraActionAt] = useState<number>();
  const [calibrationActive, setCalibrationActive] = useState(false);
  const [handCalibrationComplete, setHandCalibrationComplete] = useState(false);
  const [voiceCalibration, setVoiceCalibration] = useState<VoiceCalibrationSnapshot>({
    complete: false,
    intensity: undefined,
  });
  const [rms, setRms] = useState(0);
  const [voiceActivityState, setVoiceActivityState] = useState<VoiceActivityState>('silence');
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [lastTranscript, setLastTranscript] = useState<string>();
  const [voiceComboCount, setVoiceComboCount] = useState(0);
  const [voiceHitTotal, setVoiceHitTotal] = useState(0);
  const [lastRushAt, setLastRushAt] = useState<number>();
  const [lastVoiceAttackEvent, setLastVoiceAttackEvent] = useState<OraVoiceAttackEvent>();

  const speechSupported = getSpeechRecognitionConstructor() !== undefined;

  const resetHandRuntime = useCallback(() => {
    handJoystick.reset();
    oraActionRecognizer.reset();
    setHandObservation(emptyHandObservation);
    setMovement(emptyMovement);
    setOraAction(emptyOraAction);
  }, [handJoystick, oraActionRecognizer]);

  const stopMarkerlessCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    cameraBusyRef.current = false;
    if (cameraFrameRef.current !== undefined) {
      window.cancelAnimationFrame(cameraFrameRef.current);
    }
    cameraFrameRef.current = undefined;
    cameraDetectorRef.current?.close();
    cameraDetectorRef.current = undefined;
    stopWebcam(cameraStreamRef.current);
    cameraStreamRef.current = undefined;
    if (videoRef.current) videoRef.current.srcObject = null;
    resetHandRuntime();
    setCameraStatus('idle');
  }, [resetHandRuntime]);

  const startMarkerlessCamera = useCallback(async () => {
    if (cameraBusyRef.current || cameraStatus === 'active') return;

    cameraBusyRef.current = true;
    const session = cameraSessionRef.current + 1;
    cameraSessionRef.current = session;
    setCameraError(undefined);
    setCameraStatus('requesting-permission');

    try {
      const stream = await requestWebcam();
      if (cameraSessionRef.current !== session) {
        stopWebcam(stream);
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stopWebcam(stream);
        throw new Error('Markerlessカメラの表示先を初期化できません。');
      }

      cameraStreamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const detector = await createMediaPipeHandDetector();
      if (cameraSessionRef.current !== session) {
        detector.close();
        stopWebcam(stream);
        return;
      }
      cameraDetectorRef.current = detector;
      setCameraStatus('active');

      const detectFrame = (): void => {
        if (
          cameraSessionRef.current !== session ||
          cameraDetectorRef.current !== detector ||
          !cameraStreamRef.current ||
          !videoRef.current
        ) {
          return;
        }

        const now = performance.now();
        const nextHand = detector.detect(videoRef.current, now);
        if (calibrationActiveRef.current) handCalibrator.sample(nextHand.left, now);

        const nextNeutral = handCalibrator.getNeutral();
        const nextMovement = handJoystick.update(nextHand.left, nextNeutral, now);
        const nextOraAction = oraActionRecognizer.update(nextHand.left, nextHand.right, now);

        setHandObservation(nextHand);
        setNeutral(nextNeutral);
        setHandCalibrationComplete(handCalibrator.isComplete());
        setMovement(nextMovement);
        setOraAction(nextOraAction);
        if (nextOraAction.triggered) setLastOraActionAt(now);
        cameraFrameRef.current = window.requestAnimationFrame(detectFrame);
      };

      detectFrame();
    } catch (cause) {
      if (cameraSessionRef.current === session) {
        stopMarkerlessCamera();
        setCameraStatus(classifyMarkerlessMediaError(cause));
        setCameraError(cause instanceof Error ? cause.message : 'カメラを開始できませんでした。');
      }
    } finally {
      if (cameraSessionRef.current === session) cameraBusyRef.current = false;
    }
  }, [cameraStatus, handCalibrator, handJoystick, oraActionRecognizer, stopMarkerlessCamera]);

  const stopMicrophone = useCallback(() => {
    microphoneSessionRef.current += 1;
    microphoneBusyRef.current = false;
    if (audioTimerRef.current !== undefined) window.clearInterval(audioTimerRef.current);
    audioTimerRef.current = undefined;
    audioSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioSourceRef.current = undefined;
    analyserRef.current = undefined;
    audioSamplesRef.current = undefined;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = undefined;
    stopWebcam(microphoneStreamRef.current);
    microphoneStreamRef.current = undefined;

    voiceActivity.reset();
    voiceStartRef.current = undefined;
    lastVoiceWindowRef.current = undefined;
    lastRmsRef.current = 0;
    voiceHitTimesRef.current = [];
    voiceAttack.reset();
    setRms(0);
    setVoiceActivityState('silence');
    setVoiceDurationMs(0);
    setVoiceComboCount(0);
    setLastVoiceAttackEvent(undefined);
    setMicrophoneStatus('idle');
  }, [voiceActivity, voiceAttack]);

  const startMicrophone = useCallback(async () => {
    if (microphoneBusyRef.current || microphoneStatus === 'active') return;

    microphoneBusyRef.current = true;
    const session = microphoneSessionRef.current + 1;
    microphoneSessionRef.current = session;
    setMicrophoneError(undefined);
    setMicrophoneStatus('requesting-permission');

    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;

    const releaseLocalAudio = (): void => {
      source?.disconnect();
      analyser?.disconnect();
      context?.close().catch(() => undefined);
      stopWebcam(stream);
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('マイクを使うにはHTTPSまたはlocalhostで開いてください。');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (microphoneSessionRef.current !== session) {
        releaseLocalAudio();
        return;
      }

      const browserWindow = window as WindowWithSpeechRecognition;
      const AudioContextConstructor = window.AudioContext ?? browserWindow.webkitAudioContext;
      if (!AudioContextConstructor)
        throw new Error('このブラウザはAudioContextに対応していません。');

      context = new AudioContextConstructor();
      if (context.state === 'suspended') await context.resume();
      if (context.state !== 'running') {
        throw new Error(`AudioContextを再開できません (state=${context.state})`);
      }

      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      const analysisNode = analyser;
      if (!analysisNode) throw new Error('AnalyserNodeを初期化できません。');
      analysisNode.fftSize = FFT_SIZE;
      // destinationへは接続せず、マイク音声を再生・保存しない。
      source.connect(analysisNode);

      if (microphoneSessionRef.current !== session) {
        releaseLocalAudio();
        return;
      }

      microphoneStreamRef.current = stream;
      audioContextRef.current = context;
      audioSourceRef.current = source;
      analyserRef.current = analysisNode;
      const samples = new Float32Array(analysisNode.fftSize);
      audioSamplesRef.current = samples;

      const analyze = (): void => {
        if (
          microphoneSessionRef.current !== session ||
          analyserRef.current !== analysisNode ||
          !audioSamplesRef.current
        ) {
          return;
        }

        try {
          analysisNode.getFloatTimeDomainData(samples);
          const now = performance.now();
          const nextRms = rmsFromSamples(samples);
          const wasSpeaking = voiceActivity.getState() === 'speaking';
          const event = voiceActivity.update(nextRms, now);
          if (!wasSpeaking && voiceActivity.getState() === 'speaking') {
            voiceStartRef.current = now;
          }

          if (voiceActivity.getState() === 'speaking' && voiceStartRef.current !== undefined) {
            lastVoiceWindowRef.current = {
              startedAt: voiceStartRef.current,
              endedAt: now,
              intensity: voiceActivity.getIntensity(),
            };
          } else if (event !== null && voiceStartRef.current !== undefined) {
            const startedAt = voiceStartRef.current;
            lastVoiceWindowRef.current = {
              startedAt,
              endedAt: startedAt + event.durationMs,
              intensity: event.intensity,
            };
            voiceStartRef.current = undefined;
          }

          if (calibrationActiveRef.current) {
            voiceCalibrator.observeRms(nextRms, now);
          }

          lastRmsRef.current = nextRms;
          setRms(nextRms);
          setVoiceActivityState(voiceActivity.getState());
          setVoiceDurationMs(voiceActivity.getDurationMs(now));
          voiceHitTimesRef.current = voiceHitTimesRef.current.filter(
            (hitAt) => now - hitAt <= RUSH_WINDOW_MS,
          );
          setVoiceComboCount(voiceHitTimesRef.current.length);
          setVoiceCalibration({
            complete: voiceCalibrator.isComplete(),
            intensity: voiceCalibrator.getBaselineIntensity(),
          });
        } catch (cause) {
          if (microphoneSessionRef.current === session) {
            stopMicrophone();
            setMicrophoneStatus('error');
            setMicrophoneError(
              cause instanceof Error ? cause.message : 'マイクの解析に失敗しました。',
            );
          }
        }
      };

      setMicrophoneStatus('active');
      analyze();
      audioTimerRef.current = window.setInterval(analyze, ANALYSIS_INTERVAL_MS);
    } catch (cause) {
      releaseLocalAudio();
      if (microphoneSessionRef.current === session) {
        setMicrophoneStatus(classifyMarkerlessMediaError(cause));
        setMicrophoneError(
          cause instanceof Error ? cause.message : 'マイクを開始できませんでした。',
        );
      }
    } finally {
      if (microphoneSessionRef.current === session) microphoneBusyRef.current = false;
    }
  }, [microphoneStatus, stopMicrophone, voiceActivity, voiceCalibrator]);

  const resetCalibration = useCallback(() => {
    calibrationActiveRef.current = false;
    handCalibrator.reset();
    voiceCalibrator.reset();
    setCalibrationActive(false);
    setNeutral(undefined);
    setHandCalibrationComplete(false);
    setVoiceCalibration({ complete: false, intensity: undefined });
  }, [handCalibrator, voiceCalibrator]);

  const startCalibration = useCallback(() => {
    resetCalibration();
    calibrationActiveRef.current = true;
    setCalibrationActive(true);
  }, [resetCalibration]);

  const stopCalibration = useCallback(() => {
    calibrationActiveRef.current = false;
    setCalibrationActive(false);
  }, []);

  const handleSpeechResult = useCallback(
    (event: SpeechRecognitionEventLike) => {
      const now = performance.now();
      const activeVoiceWindow = lastVoiceWindowRef.current;
      const currentWindow =
        voiceStartRef.current !== undefined
          ? {
              startedAt: voiceStartRef.current,
              endedAt: now,
              intensity: voiceActivity.getIntensity(),
            }
          : activeVoiceWindow;

      let receivedFinalResult = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript.trim();
        if (!result?.isFinal || !transcript) continue;
        receivedFinalResult = true;

        const candidate: OraUtteranceCandidate = {
          transcript,
          startedAt: currentWindow?.startedAt ?? now,
          endedAt: currentWindow?.endedAt ?? now,
          intensity: currentWindow?.intensity ?? Math.min(1, Math.max(0, lastRmsRef.current)),
        };
        const events = voiceAttack.recognize(candidate);
        setLastTranscript(transcript);
        if (events.length === 0) continue;

        const lastEvent = events[events.length - 1]!;
        const latestHitAt = lastEvent.hitAt;
        const nextHitTimes = [
          ...voiceHitTimesRef.current,
          ...events.map((next) => next.hitAt),
        ].filter((hitAt) => latestHitAt - hitAt <= RUSH_WINDOW_MS);
        voiceHitTimesRef.current = nextHitTimes;
        setVoiceComboCount(nextHitTimes.length);
        setVoiceHitTotal((previous) => previous + events.length);
        setLastVoiceAttackEvent(lastEvent);
        if (events.some((next) => next.isRush)) setLastRushAt(latestHitAt);
      }

      if (receivedFinalResult) lastVoiceWindowRef.current = undefined;
    },
    [voiceActivity, voiceAttack],
  );

  const stopSpeechRecognition = useCallback(() => {
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = undefined;
    try {
      recognition?.stop();
    } catch {
      // すでに終了したSpeechRecognitionのstop例外はDebug UIの停止を妨げない。
    }
    setSpeechStatus(speechSupported ? 'idle' : 'unsupported');
  }, [speechSupported]);

  const startSpeechRecognition = useCallback(() => {
    if (speechRecognitionRef.current) return;
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      setSpeechStatus('unsupported');
      return;
    }

    setSpeechError(undefined);
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';
    const handleStart = (): void => setSpeechStatus('active');
    const handleResult = (event: Event): void => {
      if (isSpeechRecognitionEvent(event)) handleSpeechResult(event);
    };
    const handleError = (event: Event): void => {
      const errorEvent = event as SpeechRecognitionErrorEventLike;
      setSpeechStatus('error');
      setSpeechError(
        errorEvent.message ?? errorEvent.error ?? 'SpeechRecognitionでエラーが発生しました。',
      );
    };
    const handleEnd = (): void => {
      if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = undefined;
      setSpeechStatus(speechSupported ? 'idle' : 'unsupported');
    };
    recognition.addEventListener('start', handleStart);
    recognition.addEventListener('result', handleResult);
    recognition.addEventListener('error', handleError);
    recognition.addEventListener('end', handleEnd);

    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
      setSpeechStatus('active');
    } catch (cause) {
      speechRecognitionRef.current = undefined;
      setSpeechStatus('error');
      setSpeechError(
        cause instanceof Error ? cause.message : 'SpeechRecognitionを開始できません。',
      );
    }
  }, [handleSpeechResult, speechSupported]);

  useEffect(() => {
    return () => {
      stopMarkerlessCamera();
      stopMicrophone();
      stopSpeechRecognition();
    };
  }, [stopMarkerlessCamera, stopMicrophone, stopSpeechRecognition]);

  const formatNeutral = neutral
    ? `x ${neutral.x.toFixed(2)} / y ${neutral.y.toFixed(2)}`
    : '未確定';
  const lastEventText = lastVoiceAttackEvent
    ? `hitAt ${Math.round(lastVoiceAttackEvent.hitAt)} / intensity ${lastVoiceAttackEvent.intensity.toFixed(2)} / ${lastVoiceAttackEvent.isRush ? 'RUSH' : '通常'}`
    : 'なし';
  const speechStatusText = !speechSupported
    ? 'このブラウザは非対応'
    : speechStatus === 'active'
      ? '動作中'
      : speechStatus === 'error'
        ? 'エラー'
        : '未開始';

  return (
    <section
      className={`${styles.panel} ${styles.markerlessPanel}`}
      aria-labelledby="markerless-voice-debug-title"
    >
      <p className={styles.eyebrow}>Phase 1〜4 / Markerless</p>
      <h2 id="markerless-voice-debug-title">Markerless + Voice Debug</h2>
      <p>既存のARマーカーPoCとは独立して、手検出・音声・純粋ロジックの状態を確認します。</p>

      <div className={styles.markerlessGrid}>
        <div className={styles.debugBlock}>
          <h3>Camera / Mic 状態</h3>
          <dl className={styles.readout}>
            <div>
              <dt>Camera</dt>
              <dd>{labelForMarkerlessMediaStatus(cameraStatus)}</dd>
            </div>
            <div>
              <dt>Mic</dt>
              <dd>{labelForMarkerlessMediaStatus(microphoneStatus)}</dd>
            </div>
            <div>
              <dt>SpeechRecognition</dt>
              <dd>{speechStatusText}</dd>
            </div>
          </dl>
          <div className={styles.controls}>
            <button
              type="button"
              onClick={() => void startMarkerlessCamera()}
              disabled={cameraStatus === 'active' || cameraStatus === 'requesting-permission'}
            >
              Markerlessカメラを開始
            </button>
            <button
              type="button"
              onClick={stopMarkerlessCamera}
              disabled={cameraStatus === 'idle' || cameraStatus === 'requesting-permission'}
            >
              停止
            </button>
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              onClick={() => void startMicrophone()}
              disabled={
                microphoneStatus === 'active' || microphoneStatus === 'requesting-permission'
              }
            >
              マイクを開始
            </button>
            <button
              type="button"
              onClick={stopMicrophone}
              disabled={microphoneStatus === 'idle' || microphoneStatus === 'requesting-permission'}
            >
              停止
            </button>
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              onClick={startSpeechRecognition}
              disabled={
                !speechSupported || microphoneStatus !== 'active' || speechStatus === 'active'
              }
            >
              音声認識を開始
            </button>
            <button
              type="button"
              onClick={stopSpeechRecognition}
              disabled={speechStatus !== 'active'}
            >
              音声認識を停止
            </button>
          </div>
          {(cameraError || microphoneError || speechError) && (
            <p className={styles.error} role="alert">
              {cameraError ?? microphoneError ?? speechError}
            </p>
          )}
          <video
            ref={videoRef}
            className={styles.hiddenVideo}
            muted
            playsInline
            aria-hidden="true"
          />
        </div>

        <div className={styles.debugBlock}>
          <h3>両手位置 / Calibration</h3>
          <dl className={styles.readout}>
            <div>
              <dt>LEFT</dt>
              <dd className={handObservation.left ? styles.tracking : styles.notTracking}>
                {formatMarkerlessHand(handObservation.left)}
              </dd>
            </div>
            <div>
              <dt>RIGHT</dt>
              <dd className={handObservation.right ? styles.tracking : styles.notTracking}>
                {formatMarkerlessHand(handObservation.right)}
              </dd>
            </div>
            <div>
              <dt>Hand Neutral</dt>
              <dd>
                {handCalibrationComplete
                  ? `完了 / ${formatNeutral}`
                  : calibrationActive
                    ? '計測中'
                    : '未開始'}
              </dd>
            </div>
            <div>
              <dt>Voice baseline</dt>
              <dd>
                {voiceCalibration.complete
                  ? `完了 / intensity ${voiceCalibration.intensity?.toFixed(2) ?? '0.00'}`
                  : calibrationActive
                    ? '計測中'
                    : '未開始'}
              </dd>
            </div>
          </dl>
          <div className={styles.controls}>
            <button type="button" onClick={calibrationActive ? stopCalibration : startCalibration}>
              {calibrationActive ? 'Calibration停止' : 'Calibration開始'}
            </button>
            <button type="button" onClick={resetCalibration}>
              Calibrationリセット
            </button>
          </div>
          <p className={styles.hint}>
            左手をNeutral位置で保持し、音声baselineは最初の発話で確定します。
          </p>
        </div>

        <div className={styles.debugBlock}>
          <h3>MOVE / Air Joystick</h3>
          <dl className={styles.readout}>
            <div>
              <dt>forward</dt>
              <dd>{movement.forward.toFixed(2)}</dd>
            </div>
            <div>
              <dt>right</dt>
              <dd>{movement.right.toFixed(2)}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.debugBlock}>
          <h3>Voice combo / ATTACK</h3>
          <dl className={styles.readout}>
            <div>
              <dt>RMS</dt>
              <dd>{rms.toFixed(4)}</dd>
            </div>
            <div>
              <dt>発話区間</dt>
              <dd>
                {voiceActivityState === 'speaking' ? '発話中' : '無音'} /{' '}
                {Math.round(voiceDurationMs)}ms
              </dd>
            </div>
            <div>
              <dt>直近combo hit数</dt>
              <dd>{voiceComboCount}</dd>
            </div>
            <div>
              <dt>累積hit数</dt>
              <dd>{voiceHitTotal}</dd>
            </div>
            <div>
              <dt>直近RUSH</dt>
              <dd>{lastRushAt === undefined ? 'なし' : `${Math.round(lastRushAt)}ms`}</dd>
            </div>
            <div>
              <dt>直近transcript</dt>
              <dd>{lastTranscript ?? 'なし'}</dd>
            </div>
            <div>
              <dt>直近AttackEvent</dt>
              <dd>{lastEventText}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.debugBlock}>
          <h3>ORA_ACTION</h3>
          <div className={styles.progressRow}>
            <progress
              className={styles.progress}
              max={1}
              value={oraAction.progress}
              aria-label="ORA_ACTION進行度"
            />
            <strong>{Math.round(oraAction.progress * 100)}%</strong>
          </div>
          <p className={oraAction.isHolding ? styles.tracking : styles.notTracking}>
            {oraAction.triggered ? 'このフレームで発動' : oraAction.isHolding ? 'Hold中' : '待機'}
          </p>
          <dl className={styles.readout}>
            <div>
              <dt>直近の発動時刻</dt>
              <dd>{lastOraActionAt === undefined ? 'なし' : `${Math.round(lastOraActionAt)}ms`}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
