import { describe, expect, it } from 'vitest';

import { createAttackSequence, type SequenceStep } from './attack-sequence';

/** 固定乱数。返す値で左右・ランダム枠の解決を決め打ちする (テスト仕様 §3.2)。 */
function fixedRandom(value: number): () => number {
  return () => value;
}

/** n手ぶん取り出す。 */
function take(sequence: ReturnType<typeof createAttackSequence>, count: number): SequenceStep[] {
  return Array.from({ length: count }, () => sequence.next());
}

/**
 * Intentional Bug: 出題を使い切ったボスが、同じ技を永久に出し続ける
 *
 * ファイナルソード的なB級3DアクションRPGの「妙な壊れ方」へのオマージュとして
 * 意図的に残している (Issue #140 / Issue #42「これバグでは？と思わせる挙動」)。
 * 通常の不具合として修正しないこと。
 *
 * 本来の期待動作: 仕様 §17 のタイムラインは全成功で撃破できる長さなので、
 * 列を出し切ったら次の段か決着へ進むのが素直な設計。
 * 現在の挙動: 被弾が続いて列を使い切ると、決着がつくまで**本戦の末尾の1手**を
 * 同じモーションのまま延々と繰り返す (`attack-sequence.ts` の「仕様に記述が
 * 無いための暫定判断」)。
 *
 * ここで止めると IDLE のまま戦闘が動かなくなり、#42 が「入れてはいけない
 * 本物のバグ」として挙げる**進行不能**になる。繰り返し続けることで、
 * 見た目のB級感を保ったまま勝敗だけは必ず成立させている。
 */
describe('Intentional Bug: 攻撃シーケンスの無限リピート', () => {
  it('出題を使い切っても止まらず、決着がつくまで最後の手を出し続ける', () => {
    // 被弾が続いて列を使い切っても IDLE で固まらないこと。
    const sequence = createAttackSequence({
      random: fixedRandom(0),
      tutorial: [],
      mainBattle: [{ slot: 'FLUFFY_FUTON', assist: false }],
    });

    expect(take(sequence, 3).map((step) => step.attackId)).toEqual([
      'FLUFFY_FUTON',
      'FLUFFY_FUTON',
      'FLUFFY_FUTON',
    ]);
  });

  it('使い切ったあと繰り返すのは本戦の手で、チュートリアルへ戻らない', () => {
    // SEQ-002。チュートリアルの手を繰り返すと本戦へ入れなくなる。
    const sequence = createAttackSequence({
      random: fixedRandom(0),
      tutorial: [{ slot: 'PILLOW_SWEEP', assist: true }],
      mainBattle: [{ slot: 'YAWN_WAVE', assist: false }],
    });

    expect(take(sequence, 4).map((step) => ({ id: step.attackId, phase: step.phase }))).toEqual([
      { id: 'PILLOW_SWEEP', phase: 'TUTORIAL' },
      { id: 'YAWN_WAVE', phase: 'MAIN' },
      { id: 'YAWN_WAVE', phase: 'MAIN' },
      { id: 'YAWN_WAVE', phase: 'MAIN' },
    ]);
  });
});
