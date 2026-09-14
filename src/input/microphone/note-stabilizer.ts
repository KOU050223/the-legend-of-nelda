import { frameToNote } from './note-classifier';
import type { DetectedNote, NoteEvent, PitchFrame, PitchInputConfig } from './types';

/**
 * Pitch Detector の 1 フレームごとの揺れを吸収して、確定した音だけを
 * note-on / note-change / note-off として出力する。(Issue #43)
 *
 * 吹き始め・息継ぎ・ビブラートで `C → C# → C` のように揺れるため、
 * そのままイベント化するとゲーム側が誤入力だらけになる。
 */
export interface NoteStabilizer {
  /**
   * 1 フレーム分を投入する。
   *
   * 無音・clarity不足・周波数範囲外のフレームは `null` を渡す。
   * ここで捨てずに null として渡すのは、note-off の猶予時間を進めるため。
   * フィルタ側で握りつぶすと、鳴り止んでも note-off が永久に出ない。
   *
   * @param frame 採用可能なフレーム。無音・棄却時は null
   * @param nowMs 現在時刻（ミリ秒）
   */
  update(frame: PitchFrame | null, nowMs: number): NoteEvent | null;
  /** 現在確定している音。未確定なら null。 */
  getStableNote(): DetectedNote | null;
  /** 内部状態を捨てる。マイク停止時に呼ぶ。 */
  reset(): void;
}

/** フレームが閾値を満たすか。満たさないものは無音と同じ扱いにする。 */
export function isAcceptableFrame(frame: PitchFrame, config: PitchInputConfig): boolean {
  // NaN は比較がすべて false になり、閾値チェックを素通りしてしまう。
  if (!Number.isFinite(frame.frequencyHz)) return false;
  if (frame.rms < config.minRms) return false;
  if (frame.clarity < config.minClarity) return false;
  if (frame.frequencyHz < config.minFrequencyHz) return false;
  if (frame.frequencyHz > config.maxFrequencyHz) return false;
  return true;
}

export function createNoteStabilizer(config: PitchInputConfig): NoteStabilizer {
  /** 確定済みの音。note-off 済みなら null。 */
  let stable: DetectedNote | null = null;

  /** 確定候補と、その候補が連続した回数。 */
  let candidateMidi: number | null = null;
  let candidateNote: DetectedNote | null = null;
  let candidateCount = 0;

  /** 最後に採用可能なフレームを受け取った時刻。note-off の猶予に使う。 */
  let lastVoicedMs: number | null = null;

  function resetCandidate(): void {
    candidateMidi = null;
    candidateNote = null;
    candidateCount = 0;
  }

  return {
    update(frame, nowMs) {
      if (frame === null) {
        // 無音側。ピッチが一瞬欠けただけで note-off しないよう猶予を置く。
        resetCandidate();

        if (stable === null) return null;
        if (lastVoicedMs === null) return null;
        if (nowMs - lastVoicedMs < config.noteOffDelayMs) return null;

        const note = stable;
        stable = null;
        lastVoicedMs = null;
        return { type: 'note-off', note };
      }

      const note = frameToNote(frame);
      if (note === null) return null;

      lastVoicedMs = nowMs;

      // 同じ音が鳴り続けているだけなら何も起きない。
      if (stable !== null && note.midi === stable.midi) {
        resetCandidate();
        return null;
      }

      // 別の音の候補。一定回数続くまでは切り替えない。
      if (candidateMidi !== note.midi) {
        candidateMidi = note.midi;
        candidateCount = 1;
      } else {
        candidateCount += 1;
      }
      candidateNote = note;

      if (candidateCount < config.stableFrames) return null;

      const previous = stable;
      stable = candidateNote;
      resetCandidate();

      if (previous === null) return { type: 'note-on', note: stable };
      return { type: 'note-change', previous, note: stable };
    },

    getStableNote() {
      return stable;
    },

    reset() {
      stable = null;
      lastVoicedMs = null;
      resetCandidate();
    },
  };
}
