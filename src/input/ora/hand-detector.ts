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
type WristLandmark = { x: number; y: number };
type HandPosition = NonNullable<HandObservation['left']>;

function findWrist(
  result: ReturnType<HandLandmarker['detectForVideo']>,
  side: HandSide,
): WristLandmark | undefined {
  const handIndex = result.handedness.findIndex(
    (categories) => categories[0]?.categoryName === side,
  );
  return handIndex === -1 ? undefined : result.landmarks[handIndex]?.[0];
}

function createHandPosition(
  wrist: WristLandmark | undefined,
  before: HandPosition | undefined,
  seconds: number,
): HandPosition | undefined {
  if (!wrist) return undefined;

  return {
    x: wrist.x,
    y: wrist.y,
    velocityX: before && seconds > 0 ? (wrist.x - before.x) / seconds : 0,
    velocityY: before && seconds > 0 ? (wrist.y - before.y) / seconds : 0,
  };
}

/** MediaPipeの手首ランドマークを、認識器に依存しない観測値に変換する。 */
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
      const left = createHandPosition(findWrist(result, 'Left'), previous?.left, seconds);
      const right = createHandPosition(findWrist(result, 'Right'), previous?.right, seconds);
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
