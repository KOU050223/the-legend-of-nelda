import { useCallback, useEffect, useRef } from 'react';

import { DEFAULT_HAND_JOYSTICK_OPTIONS } from '@/input/ora/hand-joystick';
import type { OraCalibrationState, OraHandTrackingFrame } from '@/input/ora/ora-production-input';
import { useOraStatusStore } from '@/store/ora-status-store';

import styles from './OraStatusHud.module.css';

const AIR_JOYSTICK_MAX_OFFSET_PX = 38;

function calibrationHints(calibration: OraCalibrationState | null): string[] {
  if (calibration === null) return [];
  return [
    ...(calibration.handComplete ? [] : ['両手を画面下寄りの自然な位置に構えてください']),
    ...(calibration.voiceComplete ? [] : ['「オラ！」と一度声に出してください']),
  ];
}

function syncAirJoystickDot(dot: HTMLDivElement | null, frame: OraHandTrackingFrame | null): void {
  if (dot === null) return;
  if (frame === null || frame.left === undefined || frame.neutral === undefined) {
    dot.style.opacity = '0';
    dot.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const dx = frame.left.x - frame.neutral.x;
  const dy = frame.left.y - frame.neutral.y;
  const distance = Math.hypot(dx, dy);
  const maxDistance = DEFAULT_HAND_JOYSTICK_OPTIONS.maxDistance;
  const clampScale = distance > maxDistance ? maxDistance / distance : 1;
  const offsetX = (dx * clampScale * AIR_JOYSTICK_MAX_OFFSET_PX) / maxDistance;
  const offsetY = (dy * clampScale * AIR_JOYSTICK_MAX_OFFSET_PX) / maxDistance;

  dot.style.opacity = '1';
  dot.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
}

export function OraStatusHud(): React.JSX.Element | null {
  const active = useOraStatusStore((state) => state.active);
  const calibration = useOraStatusStore((state) => state.calibration);
  const status = useOraStatusStore((state) => state.status);
  const voiceCandidate = useOraStatusStore((state) => state.voiceCandidate);
  const handDot = useRef<HTMLDivElement>(null);
  const setHandDot = useCallback((dot: HTMLDivElement | null): void => {
    handDot.current = dot;
    syncAirJoystickDot(dot, useOraStatusStore.getState().handTrackingFrame);
  }, []);

  useEffect(() => {
    const update = (frame: OraHandTrackingFrame | null): void => {
      syncAirJoystickDot(handDot.current, frame);
    };
    update(useOraStatusStore.getState().handTrackingFrame);
    return useOraStatusStore.subscribe((state) => state.handTrackingFrame, update);
  }, []);

  if (!active || (calibration === null && status === null && voiceCandidate === null)) return null;

  const hints = calibrationHints(calibration);
  const hasInputError = status?.phase === 'error';
  const showSpeechRecognitionNotice =
    !hasInputError &&
    (status?.speechRecognition === 'unavailable' || status?.speechRecognition === 'error');
  const speechRecognitionNotice =
    status?.speechRecognition === 'unavailable'
      ? '音声認識に対応していないため「オラ」ATTACKは使えません（手の動きでの移動・ORA_ACTIONは引き続き使えます）'
      : '音声認識でエラーが発生したため「オラ」ATTACKは使えません（手の動きでの移動・ORA_ACTIONは引き続き使えます）';

  return (
    <section className={styles.hud} aria-live="polite">
      {(hints.length > 0 || hasInputError || showSpeechRecognitionNotice) && (
        <div className={styles.noticeStack}>
          {hints.map((hint) => (
            <div key={hint} className={styles.notice}>
              {hint}
            </div>
          ))}
          {hasInputError && (
            <div className={`${styles.notice} ${styles.error}`}>
              オラ入力を開始できません。カメラ・マイクの状態を確認してください。
            </div>
          )}
          {showSpeechRecognitionNotice && (
            <div className={`${styles.notice} ${styles.error}`}>{speechRecognitionNotice}</div>
          )}
        </div>
      )}

      <div className={styles.joystick} aria-label="Air Joystick">
        <div className={styles.joystickLabel}>AIR JOYSTICK</div>
        <div className={styles.neutral} />
        <div ref={setHandDot} className={styles.handDot} />
      </div>

      {import.meta.env.DEV && (
        <aside className={styles.debug} aria-label="オラ入力状態">
          <div>hand: {String(calibration?.handComplete ?? false)}</div>
          <div>voice: {String(calibration?.voiceComplete ?? false)}</div>
          <div>
            speech: {status?.speechRecognition ?? 'unknown'}
            {status?.reason ? ` (${status.reason})` : ''}
          </div>
          <div>candidate: {voiceCandidate ? `"${voiceCandidate.transcript}"` : '-'}</div>
          <div>
            intensity: {voiceCandidate?.intensity.toFixed(2) ?? '-'} / hits:{' '}
            {voiceCandidate?.hits ?? '-'}
          </div>
        </aside>
      )}
    </section>
  );
}
