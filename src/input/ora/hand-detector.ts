import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

import type { HandObservation } from './types';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface HandDetector {
  detect(video: HTMLVideoElement, capturedAt: number): HandObservation;
  close(): void;
}

type HandSide = 'Left' | 'Right';
type HandLandmark = { x: number; y: number };
type HandLandmarks = readonly (HandLandmark | undefined)[];
type HandPosition = NonNullable<HandObservation['left']>;

const OPEN_FINGER_DISTANCE_MARGIN = 0.02;
const CLOSED_FINGER_DISTANCE_MARGIN = 0.01;
const FINGER_LANDMARK_PAIRS = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
] as const;

function findHandLandmarks(
  result: ReturnType<HandLandmarker['detectForVideo']>,
  side: HandSide,
): HandLandmarks | undefined {
  const handIndex = result.handedness.findIndex(
    (categories) => categories[0]?.categoryName === side,
  );
  return handIndex === -1 ? undefined : result.landmarks[handIndex];
}

function distance(first: HandLandmark, second: HandLandmark): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function detectOpenHand(landmarks: HandLandmarks | undefined): boolean | undefined {
  const wrist = landmarks?.[0];
  if (!wrist) return undefined;

  const fingerLandmarks = FINGER_LANDMARK_PAIRS.map(([pipIndex, tipIndex]) => ({
    pip: landmarks[pipIndex],
    tip: landmarks[tipIndex],
  }));
  if (fingerLandmarks.some(({ pip, tip }) => !pip || !tip)) return undefined;

  // 親指を除く4本で判定し、手の向きが変わっても距離比較が崩れにくいようにする。
  return fingerLandmarks.every(
    ({ pip, tip }) => distance(wrist, tip!) > distance(wrist, pip!) + OPEN_FINGER_DISTANCE_MARGIN,
  );
}

function detectClosedHand(landmarks: HandLandmarks | undefined): boolean | undefined {
  const wrist = landmarks?.[0];
  if (!wrist) return undefined;

  const fingerLandmarks = FINGER_LANDMARK_PAIRS.map(([pipIndex, tipIndex]) => ({
    pip: landmarks[pipIndex],
    tip: landmarks[tipIndex],
  }));
  if (fingerLandmarks.some(({ pip, tip }) => !pip || !tip)) return undefined;

  return fingerLandmarks.every(
    ({ pip, tip }) => distance(wrist, tip!) < distance(wrist, pip!) - CLOSED_FINGER_DISTANCE_MARGIN,
  );
}

function createHandPosition(
  landmarks: HandLandmarks | undefined,
  before: HandPosition | undefined,
  seconds: number,
): HandPosition | undefined {
  const wrist = landmarks?.[0];
  if (!wrist) return undefined;

  const position: HandPosition = {
    x: wrist.x,
    y: wrist.y,
    velocityX: before && seconds > 0 ? (wrist.x - before.x) / seconds : 0,
    velocityY: before && seconds > 0 ? (wrist.y - before.y) / seconds : 0,
  };
  const isOpen = detectOpenHand(landmarks);
  if (isOpen !== undefined) position.isOpen = isOpen;
  const isClosed = detectClosedHand(landmarks);
  if (isClosed !== undefined) position.isClosed = isClosed;
  return position;
}

/** MediaPipeの手ランドマークを、認識器に依存しない観測値に変換する。 */
export async function createMediaPipeHandDetector(): Promise<HandDetector> {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let previous: HandObservation | undefined;

  return {
    detect(video, capturedAt) {
      const result = landmarker.detectForVideo(video, capturedAt);
      const seconds = previous ? (capturedAt - previous.capturedAt) / 1000 : 0;
      const next: HandObservation = { capturedAt };
      const left = createHandPosition(findHandLandmarks(result, 'Left'), previous?.left, seconds);
      const right = createHandPosition(
        findHandLandmarks(result, 'Right'),
        previous?.right,
        seconds,
      );
      if (left) next.left = left;
      if (right) next.right = right;
      previous = next;
      return next;
    },
    close() {
      landmarker.close();
    },
  };
}
