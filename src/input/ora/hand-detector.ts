import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

import type { HandObservation } from './types';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface HandDetector {
  detect(video: HTMLVideoElement, capturedAt: number): HandObservation;
  close(): void;
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
      const rightIndex = result.handedness.findIndex(
        (categories) => categories[0]?.categoryName === 'Right',
      );
      const wrist = rightIndex === -1 ? undefined : result.landmarks[rightIndex]?.[0];
      const before = previous?.right;
      const seconds = previous ? (capturedAt - previous.capturedAt) / 1000 : 0;
      const next: HandObservation = wrist
        ? {
            capturedAt,
            right: {
              x: wrist.x,
              y: wrist.y,
              velocityX: before && seconds > 0 ? (wrist.x - before.x) / seconds : 0,
              velocityY: before && seconds > 0 ? (wrist.y - before.y) / seconds : 0,
            },
          }
        : { capturedAt };
      previous = next;
      return next;
    },
    close() {
      landmarker.close();
    },
  };
}
