import { describe, expect, it } from 'vitest';

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

describe('isOcarinaCommand', () => {
  it('コマンドとして使う音を見分けられる', () => {
    expect(isOcarinaCommand(toOcarinaCommand('C'))).toBe(true);
    expect(isOcarinaCommand(toOcarinaCommand('D'))).toBe(false);
  });
});
