import { describe, expect, it } from 'vitest';

import { hzToNote } from '@/input/microphone/note-classifier';
import type { NoteName } from '@/input/microphone/types';

import { isOcarinaCommand, toOcarinaCommand } from './note-command-map';

describe('toOcarinaCommand', () => {
  // ド・ミ・ソだけをコマンドとして扱う。(Issue #43)
  it.each<{ name: NoteName; command: string }>([
    { name: 'C', command: 'DO' },
    { name: 'E', command: 'MI' },
    { name: 'G', command: 'SO' },
  ])('$name はコマンド $command になる', ({ name, command }) => {
    expect(toOcarinaCommand(name)).toBe(command);
  });

  // 吹き間違いを正解入力にしないため、対象外の音を C/E/G へ丸めない。
  it.each<NoteName>(['C#', 'D', 'D#', 'F', 'F#', 'G#', 'A', 'A#', 'B'])(
    '対象外の %s はコマンドへ丸めず無視する',
    (name) => {
      expect(toOcarinaCommand(name)).toBe('IGNORE');
    },
  );
});

describe('オクターブの扱い', () => {
  // 基盤は音名とオクターブを分けて返す。コマンドは音名だけで決まるため、
  // C4 / C5 / C6 はどれも DO になる。(Issue #43)
  it('検出結果のオクターブが違っても同じコマンドになる', () => {
    const commands = [261.63, 523.25, 1046.5].map((hz) => {
      const note = hzToNote(hz);
      expect(note).not.toBeNull();
      return note === null ? null : toOcarinaCommand(note.name);
    });

    expect(commands).toEqual(['DO', 'DO', 'DO']);
  });

  it('オクターブ違いでも対象外の音はコマンドにならない', () => {
    const note = hzToNote(587.33); // D5
    expect(note?.name).toBe('D');
    expect(note === null ? null : toOcarinaCommand(note.name)).toBe('IGNORE');
  });
});

describe('isOcarinaCommand', () => {
  it('コマンドとして使う音を見分けられる', () => {
    expect(isOcarinaCommand(toOcarinaCommand('C'))).toBe(true);
    expect(isOcarinaCommand(toOcarinaCommand('D'))).toBe(false);
  });
});
