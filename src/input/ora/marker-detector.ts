import type { MarkerObservation } from './types';

/** カメラ画像をアプリ固有でない MarkerObservation へ変換する境界。 */
export interface MarkerDetector {
  detect(frame: ImageData, capturedAt: number): MarkerObservation;
}
