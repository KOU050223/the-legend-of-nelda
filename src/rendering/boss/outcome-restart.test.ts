import { describe, expect, it } from 'vitest';

import { isBattleSettled, isOutcomeRestartAllowed } from './outcome-restart';

describe('決着後のリトライ入力', () => {
  it('敗北ムービーが終わるまではRキーを受け付けない', () => {
    expect(isOutcomeRestartAllowed({ outcome: 'defeat', elapsedMs: 8_999 })).toBe(false);
  });

  it('BAD END後はRキーを受け付ける', () => {
    expect(isOutcomeRestartAllowed({ outcome: 'defeat', elapsedMs: 9_000 })).toBe(true);
  });
});

describe('戦闘を止めてよい決着か', () => {
  it('勝敗がついたときだけ止める', () => {
    expect(isBattleSettled('VICTORY')).toBe(true);
    expect(isBattleSettled('DEFEAT')).toBe(true);
  });

  it('操作キャラが倒れただけでは止めない', () => {
    // 止めると NPC が蘇生に来られず、ソロで復帰できなくなる (#158)。
    expect(isBattleSettled('LOCAL_DOWN')).toBe(false);
    expect(isBattleSettled('ONGOING')).toBe(false);
  });
});
