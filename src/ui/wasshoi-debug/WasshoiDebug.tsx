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
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<WasshoiInputController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_VOICE_ACTIVITY_CONFIG.threshold);

  const play = useCallback(
    async (event: WasshoiEvent): Promise<void> => {
      const controller = controllerRef.current;
      // 停止操作で確定した最終イベントは再生しない。停止済みのContextへ
      // 再生を要求して「鳴らない」という誤表示を出すのを防ぐ。
      if (controller === null) return;
      const played = await controller.playRecordedSample(event);
      if (!played && sampleReady) {
        setError('自動再生が止められました。下のプレーヤーで一度試聴してください。');
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
      void play(event);
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
      const sample = await controller.stopRecording();
      const nextUrl = URL.createObjectURL(sample);
      setSampleUrl((previous) => {
        if (previous !== null) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setSampleReady(true);
      setRecording(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setRecording(false);
    }
  }, [recording]);

  const preview = (): void => {
    const audio = audioRef.current;
    if (audio === null) return;
    audio.currentTime = 0;
    void audio.play().catch(() => setError('ブラウザのプレーヤーから再生できませんでした。'));
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

        {sampleUrl !== null && (
          <div className={styles.samplePlayer}>
            <p>録音Sample（まずここで音が鳴るか確認）</p>
            {/* ユーザー自身が録音した短い効果音であり、字幕トラックを持たない。 */}
            {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} className={styles.audio} controls src={sampleUrl} />
          </div>
        )}

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
              わっしょーいを試聴する（プレーヤー）
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
