import { describe, expect, it } from 'vitest';

import type { NoteEvent, NoteName } from '@/input/microphone/types';

import { createMelodyRecognizer } from './melody-recognizer';

function note(name: NoteName, octave = 4): NoteEvent {
  return {
    type: 'note-on',
    note: { name, octave, midi: 60, frequencyHz: 261.63, cents: 0, clarity: 1 },
  };
}

describe('安眠の旋律の判定', () => {
  it('オクターブ差を無視して、安定した正解音ごとに進む', () => {
    const recognizer = createMelodyRecognizer({ notes: ['C', 'E', 'G'] });

    const results = [
      recognizer.consume(note('C', 3)),
      recognizer.consume(note('E', 5)),
      recognizer.consume(note('G', 4)),
    ];

    expect(results).toEqual(['CORRECT', 'CORRECT', 'COMPLETE']);
    expect(recognizer.snapshot()).toMatchObject({ progress: 3, complete: true });
  });

  it('誤った安定音では全リセットせず1段階だけ戻る', () => {
    const recognizer = createMelodyRecognizer({ notes: ['C', 'E', 'G'] });
    recognizer.consume(note('C'));
    recognizer.consume(note('E'));

    const result = recognizer.consume(note('A'));

    expect(result).toBe('MISS');
    expect(recognizer.snapshot()).toMatchObject({ progress: 1, missCount: 1, expected: 'E' });
  });

  it('note-offはミスに数えない', () => {
    const recognizer = createMelodyRecognizer({ notes: ['C'] });
    const event: NoteEvent = { type: 'note-off', note: note('C').note };

    const result = recognizer.consume(event);

    expect(result).toBe('IGNORED');
    expect(recognizer.snapshot()).toMatchObject({ progress: 0, missCount: 0 });
  });

  it('自然音だけの曲では、息の揺れで出た半音を入力・ミスとして扱わない', () => {
    const recognizer = createMelodyRecognizer({ notes: ['C', 'E'], ignoreAccidentals: true });

    expect(recognizer.consume(note('C'))).toBe('CORRECT');
    expect(recognizer.consume(note('C#'))).toBe('IGNORED');
    expect(recognizer.snapshot()).toMatchObject({ progress: 1, missCount: 0, expected: 'E' });
  });

  it('ミスが重なるとヒントと救済モードを出す', () => {
    const recognizer = createMelodyRecognizer({ notes: ['C'] });
    for (let index = 0; index < 5; index += 1) recognizer.consume(note('D'));

    expect(recognizer.snapshot()).toMatchObject({ showHint: true, tolerance: 'EASY' });
  });
});
