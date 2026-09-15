import type { NoteEvent, NoteName } from '@/input/microphone/types';

/** 曲に依存する設定。Pitch判定やブラウザAPIを持ち込まない。 */
export interface MelodyConfig {
  readonly notes: readonly NoteName[];
  readonly hintAfterMisses?: number;
  readonly easeAfterMisses?: number;
}

export type MelodyTolerance = 'NORMAL' | 'EASY';

export interface MelodySnapshot {
  readonly progress: number;
  readonly length: number;
  readonly missCount: number;
  readonly expected: NoteName | null;
  readonly showHint: boolean;
  readonly tolerance: MelodyTolerance;
  readonly complete: boolean;
}

export type MelodyResult = 'IGNORED' | 'CORRECT' | 'MISS' | 'COMPLETE';

export interface MelodyRecognizer {
  consume(event: NoteEvent): MelodyResult;
  snapshot(): MelodySnapshot;
  reset(): void;
  /** 発表・マイク障害時の保険。通常UIからは呼ばない。 */
  forceComplete(): void;
}

const DEFAULT_HINT_AFTER_MISSES = 3;
const DEFAULT_EASE_AFTER_MISSES = 5;

/**
 * 安定化済みNoteEventから旋律を判定する。
 *
 * note-off とRaw Pitchは扱わない。ノイズや一瞬の音程揺れの吸収は #43 の
 * NoteStabilizer に任せ、この層は「次の音として正しいか」だけを判断する。
 */
export function createMelodyRecognizer(config: MelodyConfig): MelodyRecognizer {
  if (config.notes.length === 0) throw new RangeError('旋律は1音以上必要です');

  const hintAfterMisses = config.hintAfterMisses ?? DEFAULT_HINT_AFTER_MISSES;
  const easeAfterMisses = config.easeAfterMisses ?? DEFAULT_EASE_AFTER_MISSES;
  let progress = 0;
  let missCount = 0;
  let complete = false;

  function expected(): NoteName | null {
    return config.notes[progress] ?? null;
  }

  function snapshot(): MelodySnapshot {
    return {
      progress,
      length: config.notes.length,
      missCount,
      expected: expected(),
      showHint: missCount >= hintAfterMisses,
      tolerance: missCount >= easeAfterMisses ? 'EASY' : 'NORMAL',
      complete,
    };
  }

  return {
    consume(event) {
      // stable note-off は「音が止んだ」だけで、旋律の一手ではない。
      if (event.type === 'note-off' || complete) return 'IGNORED';

      const note = event.note.name;
      if (note === expected()) {
        progress += 1;
        if (progress === config.notes.length) {
          complete = true;
          return 'COMPLETE';
        }
        return 'CORRECT';
      }

      // 全リセットにはしない。直前の1音だけをやり直させる。
      progress = Math.max(0, progress - 1);
      missCount += 1;
      return 'MISS';
    },

    snapshot,

    reset() {
      progress = 0;
      missCount = 0;
      complete = false;
    },

    forceComplete() {
      progress = config.notes.length;
      complete = true;
    },
  };
}
