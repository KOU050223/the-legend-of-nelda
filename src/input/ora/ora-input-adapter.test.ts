import { describe, expect, it } from 'vitest';

import { createOraInputAdapter } from './ora-input-adapter';

describe('createOraInputAdapter', () => {
  it('同じ移動を連続観測しても開始アクションを重複送信しない', () => {
    const actions: string[] = [];
    const adapter = createOraInputAdapter((action) => actions.push(action));
    const frame = {
      move: 'MOVE_LEFT' as const,
      actions: [],
      attackReady: false,
      oraPoseProgress: 0,
    };

    adapter.consume(frame);
    adapter.consume(frame);

    expect(actions).toEqual(['MOVE_LEFT']);
  });

  it('認識器が出したATTACKとORA_ACTIONをGameActionとして渡す', () => {
    const actions: string[] = [];
    const adapter = createOraInputAdapter((action) => actions.push(action));

    adapter.consume({
      move: null,
      actions: ['ATTACK', 'ORA_ACTION'],
      attackReady: false,
      oraPoseProgress: 1,
    });

    expect(actions).toEqual(['ATTACK', 'ORA_ACTION']);
  });
});
