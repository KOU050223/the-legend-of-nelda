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
// 「おらおらおら…」の合間の無音を1つの発話としてまとめて扱う上限。これを
// 超えた無音の後に始まる発話は、別物として開始時刻を仕切り直す。
const MAX_UTTERANCE_GAP_MS = 800;
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
  /**
   * カメラ/マイク許可待ちなど、初期化の途中でキャラを切り替えたときに
   * 呼び出し側が中断できるようにする。中断済みなら各awaitの直後で
   * それまでに確保したリソースを解放し、何もしないアダプタを返す。
   */
  signal?: AbortSignal;
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

interface SpeechRecognitionErrorEvent {
  error: string;
}

/**
 * 権限拒否・サービス不許可以外は、無音タイムアウト等の一時的な失敗として
 * 復帰を試みる。ここに入れなかった理由コードは全て再起動を試みる対象になる。
 */
const FATAL_SPEECH_RECOGNITION_ERRORS: ReadonlySet<string> = new Set([
  'not-allowed',
  'service-not-allowed',
]);

/** signal中断で初期化を打ち切ったときに返す、何もしないアダプタ。 */
const NOOP_ADAPTER: InputAdapter = { detach() {} };

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  addEventListener(type: 'result', listener: (event: SpeechRecognitionResultEvent) => void): void;
  addEventListener(type: 'error', listener: (event: SpeechRecognitionErrorEvent) => void): void;
  addEventListener(type: 'end', listener: () => void): void;
  removeEventListener(
    type: 'result',
    listener: (event: SpeechRecognitionResultEvent) => void,
  ): void;
  removeEventListener(type: 'error', listener: (event: SpeechRecognitionErrorEvent) => void): void;
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

export function normalizeOraSpeechIntensity(peakRms: number): number {
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
  let speechErrorListener: ((event: SpeechRecognitionErrorEvent) => void) | undefined;
  let speechEndListener: (() => void) | undefined;
  let frameId: number | undefined;
  let intervalId: number | undefined;
  let stopped = false;
  const pendingAttackTimeoutIds = new Set<number>();

  const rmsHistory: Array<{ at: number; rms: number }> = [];
  let speechStartedAt: number | null = null;
  // 直近で有声だった時刻。無音になっても(speechStartedAtと違い)クリアしない。
  // 次に有声が再開したときの無音の長さを測る基準として使う。
  let lastVoicedAt: number | null = null;
  // 「おらおらおら…」のように短い無音(hangoverMs)を挟んで連呼すると、
  // speechStartedAtは無音のたびに区切り直る一方、SpeechRecognitionはまとめて
  // 1つのfinal結果を返す。区切り直っても、まだhandleSpeechResultが消費して
  // いない発話ぶんの「本当の開始時刻」をここで覚えておき、音量ピーク検出の
  // 取りこぼし(=言い終わりの1区間だけを見て過小評価する)を防ぐ。ただし
  // MAX_UTTERANCE_GAP_MSを超える無音を挟んだら、無関係な過去の発話(例えば
  // Calibration中に拾った音)を引きずらないよう、新しい開始点として仕切り直す。
  let earliestPendingSpeechAt: number | null = null;
  // 既にATTACKへ変換した最大のSpeechRecognition結果index。同じ発話への
  // interim更新やfinal確定で二重に発火しないようにする。recognitionが
  // 再起動すると内部のindexは0から数え直されるため、再起動のたびにリセットする。
  let firedResultIndex = -1;

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

  /**
   * Calibrationが崩れた瞬間にも呼ぶ。手を見失った直後にまだ予約済みの
   * 複数hit ATTACKが発火すると、「Calibration未完了ならATTACKを一切
   * 発火しない」という前提が崩れるため。
   */
  const clearPendingAttacks = (): void => {
    for (const timeoutId of pendingAttackTimeoutIds) {
      try {
        stopTimeout(timeoutId);
      } catch {
        // 1つのタイマー取消し失敗で、他の予約ATTACKを残さない。
      }
    }
    pendingAttackTimeoutIds.clear();
  };

  const teardown = (): void => {
    if (stopped) return;
    stopped = true;

    if (intervalId !== undefined) stopInterval(intervalId);
    if (frameId !== undefined) cancelFrame(frameId);
    clearPendingAttacks();

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

  const scheduleAttack = (delayMs: number, intensity: number): void => {
    if (stopped) return;
    let timeoutId: number | undefined;
    try {
      timeoutId = startTimeout(() => {
        if (timeoutId !== undefined) pendingAttackTimeoutIds.delete(timeoutId);
        emit({ type: 'ATTACK', intensity });
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
      if (
        earliestPendingSpeechAt !== null &&
        lastVoicedAt !== null &&
        timestamp - lastVoicedAt > MAX_UTTERANCE_GAP_MS
      ) {
        // 無音が長すぎた。前の発話 (Calibration中の音等) の名残りを引きずらず、
        // ここを新しい開始点として仕切り直す。
        earliestPendingSpeechAt = null;
      }
      speechStartedAt ??= timestamp;
      earliestPendingSpeechAt ??= timestamp;
      lastVoicedAt = timestamp;
      return;
    }

    if (
      speechStartedAt !== null &&
      lastVoicedAt !== null &&
      timestamp - lastVoicedAt >= DEFAULT_VOICE_ACTIVITY_CONFIG.hangoverMs
    ) {
      // 短い無音区間の始まりを記録するだけで、earliestPendingSpeechAtは
      // 消さない。次の短い発話区間が続くかもしれず、消すと「本当の開始時刻」
      // を見失う。handleSpeechResultがfinal結果を消費した時点で初めてリセットする。
      speechStartedAt = null;
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
      // 同じ発話に何度目かのinterim更新が来ても、既にATTACKへ変換済みなら
      // 無視する（二重発火を防ぐ）。まだ何にもマッチしていない発話は、
      // 確定を待たず毎回の更新を見続ける（「オラ」と言った瞬間に反応するため、
      // isFinalを待たない）。
      if (index <= firedResultIndex) continue;
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) continue;

      const startedAt = Math.min(endedAt, earliestPendingSpeechAt ?? Math.max(0, endedAt - 1_000));
      const candidate: OraUtteranceCandidate = {
        transcript,
        startedAt,
        endedAt,
        intensity: intensityBetween(startedAt, endedAt),
      };
      // ATTACKは声だけの入力なので、声のCalibrationだけを見る。手の
      // Calibrationも条件にすると、実プレイ中に手が一瞬フレーム外へ出た
      // だけで（移動やORA_ACTIONの合間によく起きる）、その瞬間に発話した
      // 「オラ」がまるごと評価されず消える。手を条件から外し、Calibration
      // 未完了でも認識結果自体は公開する（「音声認識が拾えていない」のか
      // 「声のCalibration待ちで止めている」のかを実機で切り分けるため）。
      const voiceReady = voiceCalibrator.isComplete();
      const attacks = voiceReady ? voiceAttackRecognizer.recognize(candidate) : [];
      if (import.meta.env.DEV) {
        console.debug('[ora] voice candidate', {
          transcript: candidate.transcript,
          intensity: candidate.intensity,
          hits: attacks.length,
          isFinal: result?.isFinal === true,
          voiceReady,
        });
      }
      notifyVoiceCandidate({
        transcript: candidate.transcript,
        intensity: candidate.intensity,
        hits: attacks.length,
      });

      if (attacks.length > 0) {
        // マッチした。確定を待たずここで消費し、この発話の後続のinterim更新
        // やfinal結果で同じATTACKを繰り返し発火しない。
        firedResultIndex = index;
        earliestPendingSpeechAt = null;
        for (const [attackIndex, attack] of attacks.entries()) {
          scheduleAttack(attackIndex * VOICE_ATTACK_HIT_SPACING_MS, attack.intensity);
        }
      } else if (result?.isFinal) {
        // 確定してもマッチしなかった。この発話は終わったとみなし、次の発話の
        // ために「本当の開始時刻」の追跡をやり直す。
        earliestPendingSpeechAt = null;
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

    setSpeechRecognitionStatus('available');
    recognition = new Recognition();
    recognition.continuous = true;
    // 確定(isFinal)を待たず、「オラ」と言った瞬間の暫定結果に反応するため。
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';
    speechResultListener = handleSpeechResult;
    speechErrorListener = (event) => {
      // 無音タイムアウト('no-speech')等は継続リッスン中によく起きる一時的な
      // 失敗で、直後の'end'から自動復帰する。ここでstatusを'error'にすると
      // end側の再起動ガード('available'のときだけ再開)が永久に効かなくなる。
      if (!FATAL_SPEECH_RECOGNITION_ERRORS.has(event.error)) return;
      setSpeechRecognitionStatus(
        'error',
        'error',
        `SpeechRecognitionでカメラ/マイクの権限に関するエラーが発生しました (${event.error})。`,
      );
    };
    speechEndListener = () => {
      if (stopped || recognition === undefined || speechRecognitionStatus !== 'available') return;
      try {
        recognition.start();
        // 再起動すると内部の結果indexは0から数え直されるため、前回セッション分の
        // firedResultIndexを持ち越すと新しいセッションの序盤を誤ってスキップする。
        firedResultIndex = -1;
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

      // MOVEは手のCalibrationだけに依存させ、Calibration中も含めて毎フレーム
      // 送る。joystick.update()は手/Neutralが無ければゼロを返すので、手を
      // 見失った瞬間に確実にNeutralへ戻る (Phase2の「Hand LostでNeutral復帰」)。
      // ここで送らずにreturnすると、player-state側に残った直前の移動入力が
      // 更新されず、キャラが走り続けてしまう。
      emit({ type: 'MOVE', input: joystick.update(observation.left, neutral, timestamp) });

      // ORA_ACTIONは両手が要る。ATTACKは音声だけの入力なので、ここでは
      // 手のCalibrationだけを見る（声のCalibrationは handleSpeechResult 側で
      // 独立に見ている。一度揃うと崩れないため、ここで一緒に握り潰すと
      // 「移動やORA_ACTIONの合間に手が一瞬フレーム外へ出た」だけで、その
      // 瞬間の発話ぶんのATTACKやRush判定の連続性まで失われてしまう）。
      if (!calibration.handComplete) {
        oraActionRecognizer.reset();
        return;
      }

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

  // カメラ/マイクの許可待ち中にキャラを切り替えられても、待っている
  // Promiseそのものは中断できない (ブラウザのgetUserMedia自体に中断手段が
  // 無いため)。ただし各awaitの直後でsignalを見れば、許可が下りた直後や
  // モデル読込完了直後など、その先の初期化を進めずにすぐ解放できる。
  const bailIfAborted = (): boolean => {
    if (options.signal?.aborted !== true) return false;
    teardown();
    return true;
  };

  notifyCalibration();
  notifyStatus('requesting-permission');
  try {
    webcamStream = await requestWebcam();
    if (bailIfAborted()) return NOOP_ADAPTER;
    microphoneStream = await createMicrophoneRequest();
    if (bailIfAborted()) return NOOP_ADAPTER;
    handDetector = await createMediaPipeHandDetector();
    if (bailIfAborted()) return NOOP_ADAPTER;

    video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = webcamStream;
    await video.play();
    if (bailIfAborted()) return NOOP_ADAPTER;

    audioSession = await createWebAudioSession(microphoneStream);
    if (bailIfAborted()) return NOOP_ADAPTER;
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
