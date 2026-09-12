import { describe, expect, it } from 'vitest';

import { judgePlayerAction, type AttackTiming } from './judge';

const attack: AttackTiming = {
  correctAction: 'DODGE_LEFT',
  hitAt: 1000,
  perfectWindowMs: 100,
  acceptWindowMs: 400,
};

describe('judgePlayerAction', () => {
  it('正解入力がperfect window内ならPERFECT_DODGEになる', () => {
    expect(judgePlayerAction({ attack, action: 'DODGE_LEFT', inputAt: 1050 })).toBe(
      'PERFECT_DODGE',
    );
  });

  it('GUARDが正解でperfect window内ならJUST_GUARDになる', () => {
    expect(
      judgePlayerAction({
        attack: { ...attack, correctAction: 'GUARD' },
        action: 'GUARD',
        inputAt: 1000,
      }),
    ).toBe('JUST_GUARD');
  });

  it('正解入力でもperfect windowを外れるとHITになる', () => {
    expect(judgePlayerAction({ attack, action: 'DODGE_LEFT', inputAt: 1200 })).toBe('HIT');
  });

  it('不正解の入力はHITになる', () => {
    expect(judgePlayerAction({ attack, action: 'DODGE_RIGHT', inputAt: 1000 })).toBe('HIT');
  });

  it('accept windowを外れた入力はMISSになる', () => {
    expect(judgePlayerAction({ attack, action: 'DODGE_LEFT', inputAt: 1500 })).toBe('MISS');
  });

  it('perfect windowの境界は含む', () => {
    expect(judgePlayerAction({ attack, action: 'DODGE_LEFT', inputAt: 1100 })).toBe(
      'PERFECT_DODGE',
    );
  });
});
