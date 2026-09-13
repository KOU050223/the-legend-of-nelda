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

/** ガードの受付幅は着弾 -700ms 〜 +100ms。回避より広い。 */
const guardAttack: AttackTiming = {
  ...dodgeAttack,
  correctAction: 'GUARD',
  acceptFromMs: -700,
};

describe('judgePlayerAction', () => {
  // 入力時刻と結果の対応表。docs/testing-strategy.md §4 の境界値表に対応する。
  // 着弾は 1000ms。受付境界とその外側、perfect 境界とその外側を並べる。
  describe('回避の受付ウィンドウ (着弾 -600ms 〜 +100ms)', () => {
    it.each([
      { inputAt: 399, offset: '-601ms', expected: 'MISS' }, // 受付開始の1ms手前
      { inputAt: 400, offset: '-600ms', expected: 'HIT' }, // 受付開始ちょうど
      { inputAt: 899, offset: '-101ms', expected: 'HIT' }, // perfect の1ms手前
      { inputAt: 900, offset: '-100ms', expected: 'PERFECT_DODGE' }, // perfect 開始ちょうど
      { inputAt: 1000, offset: '±0ms', expected: 'PERFECT_DODGE' }, // 着弾ちょうど
      { inputAt: 1100, offset: '+100ms', expected: 'PERFECT_DODGE' }, // perfect 終了ちょうど
      { inputAt: 1110, offset: '+110ms', expected: 'MISS' }, // 受付終了を過ぎている
    ])('正解入力が着弾 $offset なら $expected になる', ({ inputAt, expected }) => {
      const result = judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt });

      expect(result).toBe(expected);
    });
  });

  describe('ガードの受付ウィンドウ (着弾 -700ms 〜 +100ms / 回避より広い)', () => {
    it.each([
      { inputAt: 299, offset: '-701ms', expected: 'MISS' }, // 受付開始の1ms手前
      { inputAt: 300, offset: '-700ms', expected: 'HIT' }, // 回避なら MISS になる時刻
      { inputAt: 1000, offset: '±0ms', expected: 'JUST_GUARD' }, // 着弾ちょうど
      { inputAt: 1100, offset: '+100ms', expected: 'JUST_GUARD' }, // perfect 終了ちょうど
      { inputAt: 1110, offset: '+110ms', expected: 'MISS' }, // 受付終了を過ぎている
    ])('GUARDが着弾 $offset なら $expected になる', ({ inputAt, expected }) => {
      const result = judgePlayerAction({ attack: guardAttack, action: 'GUARD', inputAt });

      expect(result).toBe(expected);
    });
  });

  // 回避の受付幅 (-600ms) では MISS になる時刻が、ガード (-700ms) では
  // 受け付けられることを1件で対比する。表を分けると見落としやすいため明示する。
  it('着弾650ms前の入力は回避ではMISSだがガードでは受け付ける', () => {
    const inputAt = 350;

    const dodged = judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt });
    const guarded = judgePlayerAction({ attack: guardAttack, action: 'GUARD', inputAt });

    expect(dodged).toBe('MISS');
    expect(guarded).toBe('HIT');
  });

  it('受付内でも不正解の入力はHITになる', () => {
    const result = judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_RIGHT', inputAt: 1000 });

    expect(result).toBe('HIT');
  });
});
