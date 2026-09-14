import { useCallback, useEffect, useRef, useState } from 'react';

import { toOcarinaCommand } from '@/game/ocarina/note-command-map';
import type { MicrophoneDebugSnapshot } from '@/input/microphone/microphone-adapter';
import { attachMicrophoneNoteInput } from '@/input/microphone/microphone-adapter';
import { formatNote, frameToNote, toSolfege } from '@/input/microphone/note-classifier';
import type { DetectedNote, MicrophoneInputStatus, NoteEvent } from '@/input/microphone/types';
import { DEFAULT_PITCH_INPUT_CONFIG } from '@/input/microphone/types';

import styles from './MicrophoneDebug.module.css';

/**
 * オカリナ実機で閾値を合わせるための開発用パネル。(Issue #43)
 *
 * ゲーム本番UIへ密結合させない。ここが無くても音声入力基盤は動く。
 * Raw Note（1フレームごとの生値）と Stable Note（確定値）の両方を出すのは、
 * 「揺れているのか、閾値で弾かれているのか」を切り分けるため。
 */
export function MicrophoneDebug(): React.JSX.Element {
  const [status, setStatus] = useState<MicrophoneInputStatus>('idle');
  const [snapshot, setSnapshot] = useState<MicrophoneDebugSnapshot | null>(null);
  const [stableNote, setStableNote] = useState<DetectedNote | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 起動状態はボタン表示に使うため ref ではなく state で持つ。
  // ref だけだと停止しても再描画されずボタンが切り替わらない。
  const [running, setRunning] = useState(false);

  const stopRef = useRef<(() => void) | null>(null);
  /**
   * 起動処理に入ったことを同期的に記録する。running(state) や stopRef だけでは、
   * 権限プロンプト待ちの await をまたいで二度押しされたときに二重起動し、
   * 先に掴んだマイクを取りこぼす。
   */
  const startingRef = useRef(false);
  /** アンマウント済みか。許可がアンマウント後に下りた場合の後始末に使う。 */
  const disposedRef = useRef(false);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    startingRef.current = false;
    setRunning(false);
    setStableNote(null);
    setSnapshot(null);
  }, []);

  // 画面を離れるときにマイクを掴んだままにしない。
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      stop();
    };
  }, [stop]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setErrorMessage(null);

    try {
      // マイク許可はページロード時ではなく、このボタン操作から要求する。
      const detach = await attachMicrophoneNoteInput(handleNote, {
        onStatusChange: setStatus,
        onDebug: setSnapshot,
      });

      // 許可が下りる前に停止・アンマウントされていたら、掴んだ直後に手放す。
      if (disposedRef.current || !startingRef.current) {
        detach();
        return;
      }

      stopRef.current = detach;
      setRunning(true);
    } catch (error) {
      startingRef.current = false;
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }

    function handleNote(event: NoteEvent): void {
      setStableNote(event.type === 'note-off' ? null : event.note);
    }
  }, []);

  const frame = snapshot?.frame ?? null;
  const rawNote = frame === null ? null : frameToNote(frame);
  const command = stableNote === null ? 'IGNORE' : toOcarinaCommand(stableNote.name);

  return (
    <section className={`${styles.layer} ${styles.panel}`} aria-label="マイク入力デバッグ">
      <h2 className={styles.title}>Microphone</h2>

      <dl className={styles.rows}>
        <Row label="Microphone" value={status.toUpperCase()} />
        <Row label="RMS" value={formatNumber(frame?.rms, 3)} />
        <Row label="Pitch" value={frame === null ? '—' : `${frame.frequencyHz.toFixed(1)} Hz`} />
        <Row label="Clarity" value={formatNumber(frame?.clarity, 2)} />
        <Row label="Accepted" value={snapshot === null ? '—' : snapshot.accepted ? 'YES' : 'NO'} />
        <Row label="Raw Note" value={rawNote === null ? '—' : formatNote(rawNote)} />
        <Row label="Note" value={stableNote === null ? '—' : formatNote(stableNote)} />
        <Row label="Solfège" value={stableNote === null ? '—' : toSolfege(stableNote.name)} />
        <Row label="Cents" value={formatCents(stableNote?.cents)} />
        <Row label="Stable" value={stableNote?.name ?? '—'} />
        <Row label="Command" value={command} />
      </dl>

      <h3 className={styles.subtitle}>Thresholds</h3>
      <dl className={styles.rows}>
        <Row label="minRms" value={String(DEFAULT_PITCH_INPUT_CONFIG.minRms)} />
        <Row label="minClarity" value={String(DEFAULT_PITCH_INPUT_CONFIG.minClarity)} />
        <Row label="stableFrames" value={String(DEFAULT_PITCH_INPUT_CONFIG.stableFrames)} />
        <Row
          label="Range"
          value={`${DEFAULT_PITCH_INPUT_CONFIG.minFrequencyHz}–${DEFAULT_PITCH_INPUT_CONFIG.maxFrequencyHz} Hz`}
        />
        <Row label="Track" value={formatTrackSettings(snapshot?.trackSettings ?? null)} />
      </dl>

      {errorMessage !== null && <p className={styles.error}>{errorMessage}</p>}

      {!running ? (
        <button type="button" className={styles.button} onClick={() => void start()}>
          マイク入力を有効にする
        </button>
      ) : (
        <button type="button" className={styles.button} onClick={stop}>
          マイク入力を停止する
        </button>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

function formatNumber(value: number | undefined, digits: number): string {
  return value === undefined ? '—' : value.toFixed(digits);
}

/** ズレは符号付きで出す。高いか低いかが一目で分かるようにするため。 */
function formatCents(cents: number | undefined): string {
  if (cents === undefined) return '—';
  const rounded = Math.round(cents);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/** Constraint は環境によって無視されるため、要求値ではなく実値を出す。 */
function formatTrackSettings(settings: MediaTrackSettings | null): string {
  if (settings === null) return '—';

  const parts: string[] = [];
  if (settings.channelCount !== undefined) parts.push(`ch=${settings.channelCount}`);
  if (settings.sampleRate !== undefined) parts.push(`${settings.sampleRate}Hz`);
  if (settings.noiseSuppression !== undefined)
    parts.push(`ns=${String(settings.noiseSuppression)}`);
  if (settings.autoGainControl !== undefined) parts.push(`agc=${String(settings.autoGainControl)}`);

  return parts.length === 0 ? '—' : parts.join(' ');
}
