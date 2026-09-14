import { useCallback, useEffect, useRef, useState } from 'react';

import {
  attachWasshoiInput,
  type WasshoiInputController,
  type WasshoiInputStatus,
} from '@/input/wasshoi/wasshoi-input';
import {
  DEFAULT_VOICE_ACTIVITY_CONFIG,
  type WasshoiDebugSnapshot,
  type WasshoiEvent,
} from '@/input/wasshoi/types';

import styles from './WasshoiDebug.module.css';

/** Issue #50 の独立した手動確認画面。ゲーム本体・マルチプレイ通信には接続しない。 */
export function WasshoiDebug(): React.JSX.Element {
  const [status, setStatus] = useState<WasshoiInputStatus>('idle');
  const [snapshot, setSnapshot] = useState<WasshoiDebugSnapshot | null>(null);
  const [sampleReady, setSampleReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<WasshoiInputController | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_VOICE_ACTIVITY_CONFIG.threshold);

  const play = useCallback(
    (event: WasshoiEvent): void => {
      if (!controllerRef.current?.playRecordedSample(event)) {
        if (sampleReady) setError('わっしょーいを再生できませんでした');
      }
    },
    [sampleReady],
  );

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

  useEffect(
    () => () => {
      stop();
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
        config: { threshold },
      });
      controllerRef.current = controller;
      setRunning(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [handleStatusChange, onEvent, threshold]);

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
      await controller.stopRecording();
      setSampleReady(true);
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
          <Row label="THRESHOLD" value={threshold.toFixed(3)} />
          <Row label="SAMPLE" value={sampleReady ? 'READY' : 'NOT READY'} />
        </dl>

        <output className={styles.event} aria-label="最後のWasshoiEvent">
          {snapshot?.lastEvent === null || snapshot?.lastEvent === undefined
            ? 'LAST EVENT: —'
            : `LAST EVENT: ${JSON.stringify(snapshot.lastEvent)}`}
        </output>

        {error !== null && <p className={styles.error}>{error}</p>}

        {!running && (
          <label className={styles.threshold}>
            発話判定の閾値
            <input
              type="range"
              min="0.001"
              max="0.05"
              step="0.001"
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>
        )}

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
              disabled={!sampleReady}
              onClick={preview}
            >
              わっしょーいを試聴する
            </button>
            <button type="button" className={styles.secondaryButton} onClick={stop}>
              マイク入力を停止する
            </button>
          </>
        )}
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
