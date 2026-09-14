import { describe, expect, it } from 'vitest';

import { formatNote, frameToNote, hzToNote, midiToHz, toSolfege } from './note-classifier';
import type { NoteName } from './types';

describe('hzToNote', () => {
  // 基準となる代表値。オカリナで使うド・ミ・ソを含む。(Issue #43)
  it.each([
    { hz: 440.0, name: 'A', octave: 4, midi: 69 },
    { hz: 523.25, name: 'C', octave: 5, midi: 72 },
    { hz: 659.25, name: 'E', octave: 5, midi: 76 },
    { hz: 783.99, name: 'G', octave: 5, midi: 79 },
    { hz: 261.63, name: 'C', octave: 4, midi: 60 },
    { hz: 1046.5, name: 'C', octave: 6, midi: 84 },
  ])('$hz Hz は $name-$octave になる', ({ hz, name, octave, midi }) => {
    const note = hzToNote(hz);

    expect(note).not.toBeNull();
    expect(note?.name).toBe(name);
    expect(note?.octave).toBe(octave);
    expect(note?.midi).toBe(midi);
  });

  it('基準ピッチちょうどならセントのズレが出ない', () => {
    expect(hzToNote(440)?.cents).toBeCloseTo(0, 5);
  });

  it('わずかに高い音は正のセントとして表される', () => {
    const note = hzToNote(524.5);

    expect(note?.name).toBe('C');
    expect(note?.cents).toBeGreaterThan(0);
    expect(note?.cents).toBeLessThan(50);
  });

  it('わずかに低い音は負のセントとして表される', () => {
    const note = hzToNote(521);

    expect(note?.name).toBe('C');
    expect(note?.cents).toBeLessThan(0);
  });

  it('半音の中間より近い側の音へ寄る', () => {
    // C5(523.25) と C#5(554.37) の中間は約 538Hz。
    expect(hzToNote(530)?.name).toBe('C');
    expect(hzToNote(546)?.name).toBe('C#');
  });

  it('セントのズレは半音の半分を超えない', () => {
    for (let hz = 200; hz <= 2000; hz += 7) {
      const note = hzToNote(hz);
      expect(note).not.toBeNull();
      expect(Math.abs(note?.cents ?? Number.NaN)).toBeLessThanOrEqual(50);
    }
  });

  it('ドを一周すると同じ音名で1オクターブ上がる', () => {
    const low = hzToNote(261.63);
    const high = hzToNote(523.25);

    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    if (low === null || high === null) return;

    expect(high.name).toBe(low.name);
    expect(high.octave).toBe(low.octave + 1);
    expect(high.midi - low.midi).toBe(12);
  });

  it('周波数として成立しない入力は音にしない', () => {
    expect(hzToNote(0)).toBeNull();
    expect(hzToNote(-100)).toBeNull();
    expect(hzToNote(Number.NaN)).toBeNull();
    expect(hzToNote(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('clarity をそのまま引き継ぐ', () => {
    expect(hzToNote(440, 0.93)?.clarity).toBeCloseTo(0.93, 5);
  });
});

describe('frameToNote', () => {
  it('検出フレームをそのまま音へ変換する', () => {
    const note = frameToNote({ frequencyHz: 523.25, clarity: 0.95, rms: 0.2, timestampMs: 10 });

    expect(note?.name).toBe('C');
    expect(note?.octave).toBe(5);
    expect(note?.clarity).toBeCloseTo(0.95, 5);
  });

  it('周波数として成立しないフレームは音にしない', () => {
    expect(frameToNote({ frequencyHz: 0, clarity: 0.95, rms: 0.2, timestampMs: 0 })).toBeNull();
  });
});

describe('midiToHz', () => {
  it('hzToNote と往復しても同じ音に戻る', () => {
    for (const midi of [60, 69, 72, 76, 79, 84]) {
      expect(hzToNote(midiToHz(midi))?.midi).toBe(midi);
    }
  });
});

describe('表示用の変換', () => {
  // 内部表現は英語音名のままで、ドレミは表示時だけ使う。(Issue #43)
  it.each<{ name: NoteName; solfege: string }>([
    { name: 'C', solfege: 'ド' },
    { name: 'D', solfege: 'レ' },
    { name: 'E', solfege: 'ミ' },
    { name: 'F', solfege: 'ファ' },
    { name: 'G', solfege: 'ソ' },
    { name: 'A', solfege: 'ラ' },
    { name: 'B', solfege: 'シ' },
  ])('$name はドレミ表記で $solfege になる', ({ name, solfege }) => {
    expect(toSolfege(name)).toBe(solfege);
  });

  it('音名とオクターブを繋げて表示する', () => {
    const note = hzToNote(523.25);
    expect(note).not.toBeNull();
    if (note === null) return;

    expect(formatNote(note)).toBe('C5');
  });
});
