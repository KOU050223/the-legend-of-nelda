import { describe, expect, it } from 'vitest';

import {
  createAttackSequence,
  DEFAULT_MAIN_SEQUENCE,
  DEFAULT_TUTORIAL_SEQUENCE,
  type SequenceStep,
} from './attack-sequence';

/** 固定乱数。返す値で左右・ランダム枠の解決を決め打ちする (テスト仕様 §3.2)。 */
function fixedRandom(value: number): () => number {
  return () => value;
}

/** n手ぶん取り出す。 */
function take(sequence: ReturnType<typeof createAttackSequence>, count: number): SequenceStep[] {
  return Array.from({ length: count }, () => sequence.next());
}

describe('createAttackSequence', () => {
  it('チュートリアルは枕・枕・あくび・あくび・布団の順に出題する', () => {
    // SEQ-001。
    const sequence = createAttackSequence({ random: fixedRandom(0) });

    expect(take(sequence, 5).map((step) => step.attackId)).toEqual([
      'PILLOW_SWEEP',
      'PILLOW_SWEEP',
      'YAWN_WAVE',
      'YAWN_WAVE',
      'FLUFFY_FUTON',
    ]);
  });

  it('チュートリアルの同じ技は1手目だけ補助表示を出し、2手目は通常判定にする', () => {
    // SEQ-001 の Tutorial / Normal の区別。
    const sequence = createAttackSequence({ random: fixedRandom(0) });

    expect(take(sequence, 5).map((step) => step.assist)).toEqual([true, false, true, false, true]);
  });

  it('チュートリアルを5手出し切ると本戦へ移る', () => {
    // SEQ-002。
    const sequence = createAttackSequence({ random: fixedRandom(0) });

    expect(sequence.phase).toBe('TUTORIAL');
    expect(take(sequence, 5).every((step) => step.phase === 'TUTORIAL')).toBe(true);
    expect(sequence.phase).toBe('MAIN');
    expect(sequence.next().phase).toBe('MAIN');
  });

  it('本戦の手は補助表示を出さない', () => {
    // SEQ-004。答えそのものを見せる UI を本戦では使わない。
    const sequence = createAttackSequence({ random: fixedRandom(0) });
    take(sequence, DEFAULT_TUTORIAL_SEQUENCE.length);

    const mainSteps = take(sequence, DEFAULT_MAIN_SEQUENCE.length);

    expect(mainSteps.every((step) => step.assist)).toBe(false);
    expect(mainSteps.some((step) => step.assist)).toBe(false);
  });

  it('本戦は枕・あくび・枕・あくび・布団・ランダム・最終布団の順に進む', () => {
    // SEQ-005。ランダム枠は乱数 0 で枕に倒す。
    const sequence = createAttackSequence({ random: fixedRandom(0) });
    take(sequence, DEFAULT_TUTORIAL_SEQUENCE.length);

    expect(take(sequence, 7).map((step) => step.attackId)).toEqual([
      'PILLOW_SWEEP',
      'YAWN_WAVE',
      'PILLOW_SWEEP',
      'YAWN_WAVE',
      'FLUFFY_FUTON',
      'PILLOW_SWEEP',
      'FLUFFY_FUTON',
    ]);
  });

  it('ランダム枠は乱数を固定するとあくびにも倒せる', () => {
    // SEQ-006。
    const sequence = createAttackSequence({ random: fixedRandom(0.9) });
    take(sequence, DEFAULT_TUTORIAL_SEQUENCE.length + 5);

    expect(sequence.next().attackId).toBe('YAWN_WAVE');
  });

  it('本戦の攻撃順を差し替えるとその順で出題する', () => {
    // 完了条件「本戦の攻撃順を設定から調整できる」。
    const sequence = createAttackSequence({
      random: fixedRandom(0),
      tutorial: [],
      mainBattle: [
        { slot: 'FLUFFY_FUTON', phase: 'MAIN', assist: false },
        { slot: 'YAWN_WAVE', phase: 'MAIN', assist: false },
      ],
    });

    expect(take(sequence, 2).map((step) => step.attackId)).toEqual(['FLUFFY_FUTON', 'YAWN_WAVE']);
  });

  it('出題を使い切っても止まらず、決着がつくまで最後の手を出し続ける', () => {
    // 被弾が続いて列を使い切っても IDLE で固まらないこと。
    const sequence = createAttackSequence({
      random: fixedRandom(0),
      tutorial: [],
      mainBattle: [{ slot: 'FLUFFY_FUTON', phase: 'MAIN', assist: false }],
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
      tutorial: [{ slot: 'PILLOW_SWEEP', phase: 'TUTORIAL', assist: true }],
      mainBattle: [{ slot: 'YAWN_WAVE', phase: 'MAIN', assist: false }],
    });

    expect(take(sequence, 4).map((step) => ({ id: step.attackId, phase: step.phase }))).toEqual([
      { id: 'PILLOW_SWEEP', phase: 'TUTORIAL' },
      { id: 'YAWN_WAVE', phase: 'MAIN' },
      { id: 'YAWN_WAVE', phase: 'MAIN' },
      { id: 'YAWN_WAVE', phase: 'MAIN' },
    ]);
  });

  it('同じ技が続いても攻撃方向は毎回引き直す', () => {
    // 完了条件「左右ランダムに発動する」。乱数を交互に返して向きが変わることを見る。
    let call = 0;
    const sequence = createAttackSequence({
      random: () => (call++ % 2 === 0 ? 0 : 0.9),
      tutorial: [],
      mainBattle: [
        { slot: 'PILLOW_SWEEP', phase: 'MAIN', assist: false },
        { slot: 'PILLOW_SWEEP', phase: 'MAIN', assist: false },
      ],
    });

    const directions = take(sequence, 2).map((step) => step.attack.direction);

    expect(new Set(directions).size).toBe(2);
  });

  it('リセットすると先頭のチュートリアルから出し直す', () => {
    // RESULT-008 の「Attack Sequence位置」。
    const sequence = createAttackSequence({ random: fixedRandom(0) });
    take(sequence, 6);

    sequence.reset();

    expect(sequence.phase).toBe('TUTORIAL');
    expect(sequence.next()).toMatchObject({ index: 0, attackId: 'PILLOW_SWEEP', assist: true });
  });

  it('本戦が空の設定は組み立て時に弾く', () => {
    // 本戦が無いとチュートリアルの手を繰り返し続け、本戦へ入れない (SEQ-002)。
    expect(() => createAttackSequence({ mainBattle: [] })).toThrow('本戦の攻撃順が空です');
    expect(() => createAttackSequence({ tutorial: [], mainBattle: [] })).toThrow(
      '本戦の攻撃順が空です',
    );
  });
});
