/**
 * マイク入力を「音楽的な値」へ正規化するための型定義。(Issue #43)
 *
 * Game Logic へは MediaStream / AudioContext / PCM を渡さず、
 * ここで定義した NoteEvent だけを渡す。Keyboard Adapter が KeyboardEvent を
 * Game Logic へ渡さないのと同じ境界。(docs/technical-design.md §5.2)
 */

/** 内部表現の正は日本語のドレミではなく英語音名。表示時だけ変換する。 */
export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

/** Pitch Detector が返す 1 フレーム分の生値。デバッグ / 閾値調整用。 */
export interface PitchFrame {
  frequencyHz: number;
  /** 0〜1。ピッチの「はっきりさ」。低い値は倍音やノイズの可能性が高い。 */
  clarity: number;
  /** 音量（Root Mean Square）。無音判定に使う。 */
  rms: number;
  timestampMs: number;
}

/** PitchFrame を平均律の音名へ変換したもの。 */
export interface DetectedNote {
  name: NoteName;
  octave: number;
  midi: number;
  frequencyHz: number;
  /** 最寄り音からのズレ（セント）。-50〜+50。 */
  cents: number;
  clarity: number;
}

/**
 * ゲーム側が購読するイベント。揺れを吸収した後の確定値だけを通知する。
 */
export type NoteEvent =
  | { type: 'note-on'; note: DetectedNote }
  | { type: 'note-change'; previous: DetectedNote; note: DetectedNote }
  | { type: 'note-off'; note: DetectedNote };

export type NoteEventListener = (event: NoteEvent) => void;

/** 実楽器に合わせて調整する前提の閾値。 */
export interface PitchInputConfig {
  minFrequencyHz: number;
  maxFrequencyHz: number;
  minClarity: number;
  minRms: number;
  /** 同じ音候補がこの回数連続したら確定する。 */
  stableFrames: number;
  /** ピッチが途切れてから note-off するまでの猶予。 */
  noteOffDelayMs: number;
}

/**
 * 初期候補値。オカリナ実機で調整する前提の暫定値。(Issue #43)
 */
export const DEFAULT_PITCH_INPUT_CONFIG: PitchInputConfig = {
  minFrequencyHz: 200,
  maxFrequencyHz: 2000,
  minClarity: 0.9,
  minRms: 0.01,
  stableFrames: 3,
  noteOffDelayMs: 120,
};

export type MicrophoneInputStatus =
  | 'idle'
  | 'requesting-permission'
  | 'active'
  | 'permission-denied'
  | 'device-not-found'
  | 'error';
