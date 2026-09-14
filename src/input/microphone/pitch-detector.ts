import { PitchDetector as PitchyDetector } from 'pitchy';

import type { PitchFrame } from './types';

/**
 * Pitch 検出の境界。pitchy を Game Logic から直接呼ばないためのInterface。
 * 将来 YIN / WASM / AudioWorklet 実装へ差し替えてもこの形は変えない。(Issue #43)
 */
export interface PitchDetector {
  /**
   * 時間波形から基本周波数を推定する。
   *
   * @returns 推定できなければ null
   */
  detect(samples: Float32Array, sampleRate: number, timestampMs: number): PitchFrame | null;
}

/** 音量（RMS）を求める。無音判定に使う。 */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;

  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

/**
 * pitchy の McLeod Pitch Method を使った実装。
 *
 * pitchy の検出器は入力長ごとに内部バッファを持つため、長さが変わったときだけ作り直す。
 */
export function createPitchyDetector(): PitchDetector {
  let detector: PitchyDetector<Float32Array> | null = null;
  let detectorLength = 0;

  return {
    detect(samples, sampleRate, timestampMs) {
      if (samples.length === 0) return null;

      if (detector === null || detectorLength !== samples.length) {
        detector = PitchyDetector.forFloat32Array(samples.length);
        detectorLength = samples.length;
      }

      const [frequencyHz, clarity] = detector.findPitch(samples, sampleRate);

      // pitchy はピッチを決められないとき [0, 0] を返す。
      if (frequencyHz <= 0) return null;

      return { frequencyHz, clarity, rms: computeRms(samples), timestampMs };
    },
  };
}
