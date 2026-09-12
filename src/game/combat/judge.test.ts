import { describe, expect, it } from 'vitest';

import { judgePlayerAction, type AttackTiming } from './judge';

/** 回避の受付幅は着弾 -600ms 〜 +100ms (docs/tests/phase1-single-player-test-spec.md §5)。 */
const dodgeAttack: AttackTiming = {
  correctAction: 'DODGE_LEFT',
  hitAt: 1000,
  acceptFromMs: -600,
  acceptToMs: 100,
  perfectFromMs: -100,
  perfectToMs: 100,
};

/** ガードの受付幅は着弾 -700ms 〜 +100ms。 */
const guardAttack: AttackTiming = {
  ...dodgeAttack,
  correctAction: 'GUARD',
  acceptFromMs: -700,
};

describe('judgePlayerAction', () => {
  it('正解入力がperfect window内ならPERFECT_DODGEになる', () => {
    expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 1050 })).toBe(
      'PERFECT_DODGE',
    );
  });

  it('GUARDが正解でperfect window内ならJUST_GUARDになる', () => {
    expect(judgePlayerAction({ attack: guardAttack, action: 'GUARD', inputAt: 1000 })).toBe(
      'JUST_GUARD',
    );
  });

  it('正解入力でもperfect windowを外れるとHITになる', () => {
    // 受付内 (-600ms) だが perfect window (-100ms) より早い。
    expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 800 })).toBe(
      'HIT',
    );
  });

  it('不正解の入力はHITになる', () => {
    expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_RIGHT', inputAt: 1000 })).toBe(
      'HIT',
    );
  });

  it('perfect windowの境界は含む', () => {
    expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 1100 })).toBe(
      'PERFECT_DODGE',
    );
  });

  describe('受付ウィンドウは着弾前後で非対称になる', () => {
    it('回避は着弾600ms前の入力を受け付ける (MISSにしない)', () => {
      expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 400 })).toBe(
        'HIT',
      );
    });

    it('回避は着弾601ms前の入力をMISSにする', () => {
      expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 399 })).toBe(
        'MISS',
      );
    });

    it('回避は着弾100ms後の入力を受け付ける', () => {
      expect(
        judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 1100 }),
      ).not.toBe('MISS');
    });

    it('回避は着弾110ms後の入力をMISSにする', () => {
      expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 1110 })).toBe(
        'MISS',
      );
    });

    it('ガードは回避より広く着弾700ms前の入力を受け付ける', () => {
      expect(judgePlayerAction({ attack: guardAttack, action: 'GUARD', inputAt: 300 })).toBe('HIT');
    });

    it('ガードは着弾701ms前の入力をMISSにする', () => {
      expect(judgePlayerAction({ attack: guardAttack, action: 'GUARD', inputAt: 299 })).toBe(
        'MISS',
      );
    });

    it('ガードは着弾110ms後の入力をMISSにする', () => {
      expect(judgePlayerAction({ attack: guardAttack, action: 'GUARD', inputAt: 1110 })).toBe(
        'MISS',
      );
    });
  });
});
