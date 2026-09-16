import { describe, expect, it } from 'vitest';

import type { NoteEvent, NoteName } from '@/input/microphone/types';

import { FINALE_OCARINA_MELODY } from './finale-ocarina-melody';
import { createMelodyRecognizer } from './melody-recognizer';

function note(name: NoteName, octave = 4): NoteEvent {
  return {
    type: 'note-on',
    note: { name, octave, midi: 60, frequencyHz: 261.63, cents: 0, clarity: 1 },
  };
}

describe('安眠の旋律の判定', () => {
  it('ミ・ソ・レ・ミ・ソ・レをオクターブ差なく演奏すると完了する', () => {
    const recognizer = createMelodyRecognizer({ notes: FINALE_OCARINA_MELODY });

    const results = [
      recognizer.consume(note('E', 3)),
      recognizer.consume(note('G', 5)),
      recognizer.consume(note('D', 4)),
      recognizer.consume(note('E', 5)),
      recognizer.consume(note('G', 3)),
      recognizer.consume(note('D', 4)),
    ];

    expect(results).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'COMPLETE']);
    expect(recognizer.snapshot()).toMatchObject({ progress: 6, complete: true });
  });

  it('誤った安定音では全リセットせず1段階だけ戻る', () => {
    const recognizer = createMelodyRecognizer({ notes: FINALE_OCARINA_MELODY });
    recognizer.consume(note('E'));
    recognizer.consume(note('G'));

    const result = recognizer.consume(note('A'));

    expect(result).toBe('MISS');
    expect(recognizer.snapshot()).toMatchObject({ progress: 1, missCount: 1, expected: 'G' });
  });

  it('note-offはミスに数えない', () => {
    const recognizer = createMelodyRecognizer({ notes: ['C'] });
    const event: NoteEvent = { type: 'note-off', note: note('C').note };

    const result = recognizer.consume(event);

    expect(result).toBe('IGNORED');
    expect(recognizer.snapshot()).toMatchObject({ progress: 0, missCount: 0 });
  });

  it('自然音だけの曲では、息の揺れで出た半音を入力・ミスとして扱わない', () => {
    const recognizer = createMelodyRecognizer({
      notes: FINALE_OCARINA_MELODY,
      ignoreAccidentals: true,
    });

    expect(recognizer.consume(note('E'))).toBe('CORRECT');
    expect(recognizer.consume(note('F#'))).toBe('IGNORED');
    expect(recognizer.snapshot()).toMatchObject({ progress: 1, missCount: 0, expected: 'G' });
  });

  it('ミスが重なるとヒントと救済モードを出す', () => {
    const recognizer = createMelodyRecognizer({ notes: FINALE_OCARINA_MELODY });
    for (let index = 0; index < 5; index += 1) recognizer.consume(note('D'));

    expect(recognizer.snapshot()).toMatchObject({ showHint: true, tolerance: 'EASY' });
  });

  it('発表用の強制成功で6音すべてを完了として扱う', () => {
    const recognizer = createMelodyRecognizer({ notes: FINALE_OCARINA_MELODY });

    recognizer.forceComplete();

    expect(recognizer.snapshot()).toMatchObject({ progress: 6, complete: true });
  });
});
