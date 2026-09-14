import initializeAruco, { ARucoDetector } from '@ar-js-org/aruco-rs';

import type { MarkerDetector } from './marker-detector';
import type { MarkerObservation, MarkerPosition } from './types';

interface ArucoMarker {
  id: number;
  corners: readonly { x: number; y: number }[];
}

export interface ArucoMarkerDetectorOptions {
  leftMarkerId?: number;
  rightMarkerId?: number;
}

const DEFAULT_LEFT_MARKER_ID = 0;
const DEFAULT_RIGHT_MARKER_ID = 1;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isArucoMarker(value: unknown): value is ArucoMarker {
  if (!value || typeof value !== 'object') return false;
  if (!('id' in value) || !('corners' in value)) return false;
  return (
    typeof value.id === 'number' &&
    Array.isArray(value.corners) &&
    value.corners.every(
      (corner) =>
        corner &&
        typeof corner === 'object' &&
        'x' in corner &&
        'y' in corner &&
        typeof corner.x === 'number' &&
        typeof corner.y === 'number',
    )
  );
}

function toPosition(
  marker: ArucoMarker,
  frame: ImageData,
): Omit<MarkerPosition, 'velocityX' | 'velocityY'> {
  const center = marker.corners.reduce(
    (total, corner) => ({ x: total.x + corner.x, y: total.y + corner.y }),
    { x: 0, y: 0 },
  );
  const averageSide =
    marker.corners.reduce(
      (total, corner, index, corners) =>
        total + distance(corner, corners[(index + 1) % corners.length]!),
      0,
    ) / marker.corners.length;

  return {
    x: center.x / marker.corners.length / frame.width,
    y: center.y / marker.corners.length / frame.height,
    size: averageSide / Math.min(frame.width, frame.height),
  };
}

/**
 * js-aruco2 の角座標を、後段が扱う正規化済みの観測値へ閉じ込める実装。
 * ID 0 を LEFT、ID 1 を RIGHT として印刷する。別の認識器へ交換しても
 * MarkerDetector インターフェースと MarkerObservation は変わらない。
 */
export async function createArucoMarkerDetector(
  options: ArucoMarkerDetectorOptions = {},
): Promise<MarkerDetector> {
  await initializeAruco();
  const detector = new ARucoDetector('ARUCO');
  const markerIds = {
    left: options.leftMarkerId ?? DEFAULT_LEFT_MARKER_ID,
    right: options.rightMarkerId ?? DEFAULT_RIGHT_MARKER_ID,
  };
  let previous: MarkerObservation | undefined;

  return {
    detect(frame, capturedAt) {
      const next: MarkerObservation = { capturedAt };
      const markers = detector.detect_image(frame.width, frame.height, new Uint8Array(frame.data));

      for (const marker of Array.isArray(markers) ? markers.filter(isArucoMarker) : []) {
        const side =
          marker.id === markerIds.left
            ? 'left'
            : marker.id === markerIds.right
              ? 'right'
              : undefined;
        if (!side || marker.corners.length !== 4) continue;

        const position = toPosition(marker, frame);
        const before = previous?.[side];
        const elapsedSeconds = previous ? (capturedAt - previous.capturedAt) / 1000 : 0;
        next[side] = {
          ...position,
          velocityX: before && elapsedSeconds > 0 ? (position.x - before.x) / elapsedSeconds : 0,
          velocityY: before && elapsedSeconds > 0 ? (position.y - before.y) / elapsedSeconds : 0,
        };
      }

      previous = next;
      return next;
    },
  };
}
