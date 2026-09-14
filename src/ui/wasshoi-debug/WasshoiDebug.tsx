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

const THRESHOLD_STORAGE_KEY = 'nelda.wasshoi.threshold';

function loadThreshold(): number {
  const stored = Number(window.localStorage.getItem(THRESHOLD_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0.001 && stored <= 0.05
    ? stored
    : DEFAULT_VOICE_ACTIVITY_CONFIG.threshold;
}

/** Issue #50 の独立した手動確認画面。ゲーム本体・マルチプレイ通信には接続しない。 */
export function WasshoiDebug(): React.JSX.Element {
  const [status, setStatus] = useState<WasshoiInputStatus>('idle');
  const [snapshot, setSnapshot] = useState<WasshoiDebugSnapshot | null>(null);
  const [lastOutput, setLastOutput] = useState('—');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<WasshoiInputController | null>(null);
  const [threshold, setThreshold] = useState(loadThreshold);

  useEffect(() => {
    window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(threshold));
  }, [threshold]);

  const play = useCallback(async (event: WasshoiEvent): Promise<void> => {
    const controller = controllerRef.current;
    // 停止操作で確定した最終イベントは再生しない。停止済みのContextへ
    // 再生を要求して「鳴らない」という誤表示を出すのを防ぐ。
    if (controller === null) return;
    const played = await controller.playWasshoi(event);
    setLastOutput(played ? 'PLAYED' : 'NOT PLAYED');
    if (!played) setError('システムわっしょーいを再生できませんでした。');
  }, []);

  const onEvent = useCallback(
    (event: WasshoiEvent): void => {
      setSnapshot((previous) => ({
        state: 'silence',
        rms: previous?.rms ?? 0,
        durationMs: 0,
        intensity: 0,
        noiseFloor: previous?.noiseFloor ?? 0,
        effectiveThreshold: previous?.effectiveThreshold ?? threshold,
        lastEvent: event,
      }));
      void play(event);
    },
    [play, threshold],
  );

  const stop = useCallback((): void => {
    controllerRef.current?.stop();
    controllerRef.current = null;
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

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-label="わっしょーいデバッグ">
        <p className={styles.eyebrow}>PAY DAISUKE / ISSUE #75</p>
        <h1>Wasshoi Debug</h1>
        <p className={styles.description}>
          発話内容は保存も送信もしません。声量と長さだけを「わっしょーい」に変換します。
        </p>
        <p className={styles.guide}>マイクを許可したら、そのまま普通に話してください。</p>

        <dl className={styles.rows}>
          <Row label="MIC" value={status.toUpperCase()} />
          <Row label="STATE" value={(snapshot?.state ?? 'silence').toUpperCase()} />
          <Row label="RMS" value={(snapshot?.rms ?? 0).toFixed(3)} />
          <Row label="INTENSITY" value={(snapshot?.intensity ?? 0).toFixed(2)} />
          <Row label="DURATION" value={`${Math.round(snapshot?.durationMs ?? 0)} ms`} />
          <Row label="THRESHOLD" value={threshold.toFixed(3)} />
          <Row label="NOISE FLOOR" value={(snapshot?.noiseFloor ?? 0).toFixed(3)} />
          <Row
            label="EFFECTIVE GATE"
            value={(snapshot?.effectiveThreshold ?? threshold).toFixed(3)}
          />
          <Row label="WASSHOI ENGINE" value={running ? 'READY' : 'IDLE'} />
          <Row label="LAST OUTPUT" value={lastOutput} />
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
