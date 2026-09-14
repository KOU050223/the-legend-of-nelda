import { useCallback, useEffect, useRef, useState } from 'react';

import {
  attachWasshoiInput,
  type WasshoiInputController,
  type WasshoiInputStatus,
} from '@/input/wasshoi/wasshoi-input';
import type { WasshoiDebugSnapshot, WasshoiEvent } from '@/input/wasshoi/types';

import styles from './WasshoiDebug.module.css';

/** Issue #50 の独立した手動確認画面。ゲーム本体・マルチプレイ通信には接続しない。 */
export function WasshoiDebug(): React.JSX.Element {
  const [status, setStatus] = useState<WasshoiInputStatus>('idle');
  const [snapshot, setSnapshot] = useState<WasshoiDebugSnapshot | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<WasshoiInputController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);

  const play = useCallback((event: WasshoiEvent): void => {
    const audio = audioRef.current;
    if (audio === null || sampleUrlRef.current === null) return;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.15 + event.intensity * 0.85;
    // 長い発話ほどゆっくり、短い発話ほど速くする。内容は一切反映しない。
    audio.playbackRate = Math.min(1.6, Math.max(0.65, 700 / Math.max(250, event.durationMs)));
    void audio.play().catch(() => setError('わっしょーいを再生できませんでした'));
  }, []);

  const onEvent = useCallback(
    (event: WasshoiEvent): void => {
      setSnapshot((previous) => ({
        state: 'silence',
        rms: previous?.rms ?? 0,
        durationMs: 0,
        intensity: 0,
        lastEvent: event,
      }));
      play(event);
    },
    [play],
  );

  const stop = useCallback((): void => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    setRecording(false);
    setRunning(false);
  }, []);

  useEffect(() => {
    sampleUrlRef.current = sampleUrl;
  }, [sampleUrl]);

  useEffect(
    () => () => {
      stop();
      if (sampleUrlRef.current !== null) URL.revokeObjectURL(sampleUrlRef.current);
    },
    [stop],
  );

  const handleStatusChange = useCallback((next: WasshoiInputStatus): void => {
    setStatus(next);
    if (next === 'idle' || next === 'error' || next === 'permission-denied') {
      controllerRef.current = null;
      setRecording(false);
      setRunning(false);
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (controllerRef.current !== null) return;
    setError(null);
    try {
      const controller = await attachWasshoiInput(onEvent, {
        onStatusChange: handleStatusChange,
        onDebug: setSnapshot,
      });
      controllerRef.current = controller;
      setRunning(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [handleStatusChange, onEvent]);

  const toggleRecording = useCallback(async (): Promise<void> => {
    const controller = controllerRef.current;
    if (controller === null) return;
    setError(null);
    try {
      if (!recording) {
        controller.startRecording();
        setRecording(true);
        return;
      }
      const sample = await controller.stopRecording();
      const nextUrl = URL.createObjectURL(sample);
      setSampleUrl((previous) => {
        if (previous !== null) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setRecording(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setRecording(false);
    }
  }, [recording]);

  const preview = (): void => {
    play({ type: 'WASSHOI', intensity: 0.6, durationMs: 700 });
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-label="わっしょーいデバッグ">
        <p className={styles.eyebrow}>PAY DAISUKE / ISSUE #50</p>
        <h1>Wasshoi Debug</h1>
        <p className={styles.description}>
          発話内容は保存も送信もしません。声量と長さだけを「わっしょーい」に変換します。
        </p>

        <dl className={styles.rows}>
          <Row label="MIC" value={status.toUpperCase()} />
          <Row label="STATE" value={(snapshot?.state ?? 'silence').toUpperCase()} />
          <Row label="RMS" value={(snapshot?.rms ?? 0).toFixed(3)} />
          <Row label="INTENSITY" value={(snapshot?.intensity ?? 0).toFixed(2)} />
          <Row label="DURATION" value={`${Math.round(snapshot?.durationMs ?? 0)} ms`} />
          <Row label="SAMPLE" value={sampleUrl === null ? 'NOT READY' : 'READY'} />
        </dl>

        <output className={styles.event} aria-label="最後のWasshoiEvent">
          {snapshot?.lastEvent === null || snapshot?.lastEvent === undefined
            ? 'LAST EVENT: —'
            : `LAST EVENT: ${JSON.stringify(snapshot.lastEvent)}`}
        </output>

        {error !== null && <p className={styles.error}>{error}</p>}

        {!running ? (
          <button type="button" className={styles.button} onClick={() => void start()}>
            マイク入力を有効にする
          </button>
        ) : (
          <>
            <button type="button" className={styles.button} onClick={() => void toggleRecording()}>
              {recording ? '録音を完了する' : '「わっしょーい」を録音する'}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={sampleUrl === null}
              onClick={preview}
            >
              わっしょーいを試聴する
            </button>
            <button type="button" className={styles.secondaryButton} onClick={stop}>
              マイク入力を停止する
            </button>
          </>
        )}
        {/* ユーザーがこの画面で録音した効果音であり、字幕トラックを持たない。 */}
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} src={sampleUrl ?? undefined} />
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
