import type { DetectedNote, NoteName, PitchFrame } from './types';

/** MIDI番号の剰余順。index 0 = C。 */
const NOTE_NAMES: readonly NoteName[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

/** 表示用のドレミ変換。内部表現は英語音名のままにしておく。 */
const SOLFEGE: Readonly<Record<NoteName, string>> = {
  C: 'ド',
  'C#': 'ド#',
  D: 'レ',
  'D#': 'レ#',
  E: 'ミ',
  F: 'ファ',
  'F#': 'ファ#',
  G: 'ソ',
  'G#': 'ソ#',
  A: 'ラ',
  'A#': 'ラ#',
  B: 'シ',
};

/** 基準ピッチ A4 = 440Hz を MIDI 69 とする。 */
const A4_HZ = 440;
const A4_MIDI = 69;
const SEMITONES_PER_OCTAVE = 12;

/** 平均律で Hz を連続的な MIDI 値（小数）へ変換する。 */
function hzToMidiFloat(frequencyHz: number): number {
  return A4_MIDI + SEMITONES_PER_OCTAVE * Math.log2(frequencyHz / A4_HZ);
}

/** MIDI 番号から理論周波数を求める。テストと cents 検証用。 */
export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

/**
 * Hz を最寄りの平均律音へ変換する。
 *
 * 丸めは四捨五入なので、半音の中間より近い側へ寄る。
 * D を C や E へ強制分類はしない。対象音の絞り込みはゲーム側の責務。(Issue #43)
 *
 * @returns 変換できない入力（0以下 / 非有限）では null
 */
export function hzToNote(frequencyHz: number, clarity = 1): DetectedNote | null {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return null;

  const midiFloat = hzToMidiFloat(frequencyHz);
  const midi = Math.round(midiFloat);

  // 最寄り音からのズレをセントで表す。1半音 = 100 cents。
  const cents = (midiFloat - midi) * 100;

  // MIDI 0 = C-1 なので、オクターブ番号は 1 引く。
  const octave = Math.floor(midi / SEMITONES_PER_OCTAVE) - 1;

  // 負の MIDI でも正しい音名になるよう、剰余を正へ丸める。
  const nameIndex = ((midi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
  const name = NOTE_NAMES[nameIndex];
  if (name === undefined) return null;

  return { name, octave, midi, frequencyHz, cents, clarity };
}

/** PitchFrame を DetectedNote へ変換する。 */
export function frameToNote(frame: PitchFrame): DetectedNote | null {
  return hzToNote(frame.frequencyHz, frame.clarity);
}

/** Debug UI 表示用にドレミへ変換する。 */
export function toSolfege(name: NoteName): string {
  return SOLFEGE[name];
}

/** `C5` のような表記を作る。Debug UI 用。 */
export function formatNote(note: DetectedNote): string {
  return `${note.name}${note.octave}`;
}
