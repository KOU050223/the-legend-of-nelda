import { describe, expect, it } from 'vitest';

import { hzToNote } from './note-classifier';
import { computeRms, createPitchyDetector } from './pitch-detector';

const SAMPLE_RATE = 48_000;

/** 指定周波数の正弦波を作る。実マイクの代わりに使う。 */
function sineWave(frequencyHz: number, length = 2048, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / SAMPLE_RATE);
  }
  return samples;
}

describe('createPitchyDetector', () => {
  // オカリナで使うド・ミ・ソを正弦波で再現し、周波数を復元できるか見る。(Issue #43)
  it.each([
    { hz: 523.25, name: 'C', octave: 5 },
    { hz: 659.25, name: 'E', octave: 5 },
    { hz: 783.99, name: 'G', octave: 5 },
    { hz: 440.0, name: 'A', octave: 4 },
  ])('$hz Hz の正弦波から $name-$octave を復元できる', ({ hz, name, octave }) => {
    const detector = createPitchyDetector();

    const frame = detector.detect(sineWave(hz), SAMPLE_RATE, 0);

    expect(frame).not.toBeNull();
    if (frame === null) return;

    // 半音（約6%）よりずっと内側に収まっていること。
    expect(frame.frequencyHz).toBeGreaterThan(hz * 0.98);
    expect(frame.frequencyHz).toBeLessThan(hz * 1.02);

    const note = hzToNote(frame.frequencyHz, frame.clarity);
    expect(note?.name).toBe(name);
    expect(note?.octave).toBe(octave);
  });

  it('きれいな正弦波でははっきりしたピッチとして返る', () => {
    const detector = createPitchyDetector();

    const frame = detector.detect(sineWave(523.25), SAMPLE_RATE, 0);

    expect(frame?.clarity).toBeGreaterThan(0.9);
  });

  it('入力した時刻をそのまま持ち回る', () => {
    const detector = createPitchyDetector();

    expect(detector.detect(sineWave(523.25), SAMPLE_RATE, 1234)?.timestampMs).toBe(1234);
  });

  it('無音からはピッチを返さない', () => {
    const detector = createPitchyDetector();

    const frame = detector.detect(new Float32Array(2048), SAMPLE_RATE, 0);

    // ピッチが取れないか、取れても音量が無音相当であること。
    expect(frame === null || frame.rms < 0.001).toBe(true);
  });

  it('窓長が変わっても検出し続けられる', () => {
    const detector = createPitchyDetector();

    expect(detector.detect(sineWave(523.25, 2048), SAMPLE_RATE, 0)).not.toBeNull();
    expect(detector.detect(sineWave(523.25, 4096), SAMPLE_RATE, 0)).not.toBeNull();
  });

  it('空の入力では何も返さない', () => {
    expect(createPitchyDetector().detect(new Float32Array(0), SAMPLE_RATE, 0)).toBeNull();
  });
});

describe('computeRms', () => {
  it('無音は 0 になる', () => {
    expect(computeRms(new Float32Array(128))).toBe(0);
  });

  it('振幅 A の正弦波では A/√2 になる', () => {
    expect(computeRms(sineWave(523.25, 4800, 0.5))).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it('音が大きいほど値も大きくなる', () => {
    const quiet = computeRms(sineWave(523.25, 2048, 0.05));
    const loud = computeRms(sineWave(523.25, 2048, 0.5));

    expect(loud).toBeGreaterThan(quiet);
  });

  it('サンプルがなければ 0 を返す', () => {
    expect(computeRms(new Float32Array(0))).toBe(0);
  });
});
