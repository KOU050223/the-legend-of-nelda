import { useCallback, useEffect, useRef, useState } from 'react';

import { createArucoMarkerDetector } from '@/input/ora/aruco-marker-detector';
import { createOraGestureRecognizer } from '@/input/ora/ora-gesture-recognizer';
import { createOraInputAdapter } from '@/input/ora/ora-input-adapter';
import type { MarkerObservation, OraGameAction, OraRecognition } from '@/input/ora/types';
import { requestWebcam, stopWebcam } from '@/input/ora/webcam';

import styles from './OraDebugPage.module.css';

const emptyObservation: MarkerObservation = { capturedAt: 0 };
const emptyRecognition: OraRecognition = {
  move: null,
  actions: [],
  attackReady: false,
  oraPoseProgress: 0,
};

function formatPosition(position: MarkerObservation['left']): string {
  if (!position) return '未検出';
  return `x ${position.x.toFixed(2)} / y ${position.y.toFixed(2)} / size ${position.size.toFixed(2)} / vx ${position.velocityX.toFixed(2)} / vy ${position.velocityY.toFixed(2)}`;
}

function drawMarkerOverlay(
  context: CanvasRenderingContext2D,
  observation: MarkerObservation,
): void {
  context.font = '16px sans-serif';
  for (const [label, marker, color] of [
    ['LEFT', observation.left, '#67e8f9'],
    ['RIGHT', observation.right, '#f9a8d4'],
  ] as const) {
    if (!marker) continue;
    const x = marker.x * context.canvas.width;
    const y = marker.y * context.canvas.height;
    const radius = (marker.size * Math.min(context.canvas.width, context.canvas.height)) / 2;
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = color;
    context.fillText(label, x + radius + 6, y - radius - 6);
  }
}

/** `?debug=ora` のみで使う、ゲーム本体と独立したカメラ入力の検証画面。 */
export function OraDebugPage(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(false);
  const [observation, setObservation] = useState<MarkerObservation>(emptyObservation);
  const [recognition, setRecognition] = useState<OraRecognition>(emptyRecognition);
  const [lastAction, setLastAction] = useState<OraGameAction>();

  const stop = useCallback(() => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    stopWebcam(streamRef.current);
    streamRef.current = undefined;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(undefined);
    setLastAction(undefined);
    try {
      const stream = await requestWebcam();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        stopWebcam(stream);
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('カメラフレームを描画できません。');
      const detector = await createArucoMarkerDetector();
      const recognizer = createOraGestureRecognizer();
      const adapter = createOraInputAdapter(setLastAction);
      setActive(true);

      const detectFrame = (): void => {
        if (!streamRef.current || !videoRef.current || !canvasRef.current) return;
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const nextObservation = detector.detect(
          context.getImageData(0, 0, canvas.width, canvas.height),
          performance.now(),
        );
        const nextRecognition = recognizer.recognize(nextObservation);
        adapter.consume(nextRecognition);
        drawMarkerOverlay(context, nextObservation);
        setObservation(nextObservation);
        setRecognition(nextRecognition);
        frameRef.current = requestAnimationFrame(detectFrame);
      };
      detectFrame();
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : 'Webカメラを開始できませんでした。');
    }
  }, [stop]);

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="ora-debug-title">
        <p className={styles.eyebrow}>Issue #49 / PoC</p>
        <h1 id="ora-debug-title">ORA マーカー入力 Debug</h1>
        <p>ARUCO_MIP_36h12 の ID 0 を LEFT、ID 1 を RIGHT としてカメラへ向けます。</p>
        <div className={styles.controls}>
          <button type="button" onClick={() => void start()} disabled={active}>
            カメラを開始
          </button>
          <button type="button" onClick={stop} disabled={!active}>
            カメラを停止
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <video ref={videoRef} className={styles.hiddenVideo} muted playsInline aria-hidden="true" />
        <canvas
          ref={canvasRef}
          className={styles.preview}
          aria-label="カメラのマーカー検出プレビュー"
        />
      </section>
      <section className={styles.panel} aria-label="認識状態">
        <h2>認識状態</h2>
        <dl className={styles.readout}>
          <div>
            <dt>LEFT (ID 0)</dt>
            <dd>{formatPosition(observation.left)}</dd>
          </div>
          <div>
            <dt>RIGHT (ID 1)</dt>
            <dd>{formatPosition(observation.right)}</dd>
          </div>
          <div>
            <dt>MOVE</dt>
            <dd>{recognition.move ?? 'NEUTRAL'}</dd>
          </div>
          <div>
            <dt>ATTACK</dt>
            <dd>{recognition.attackReady ? 'READY' : '待機中'}</dd>
          </div>
          <div>
            <dt>ORA pose</dt>
            <dd>{Math.round(recognition.oraPoseProgress * 100)}%</dd>
          </div>
          <div>
            <dt>最後の GameAction</dt>
            <dd>{lastAction ?? 'なし'}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
