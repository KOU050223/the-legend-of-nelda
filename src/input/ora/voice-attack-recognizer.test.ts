import { describe, expect, it } from 'vitest';

import { createOraVoiceAttackRecognizer } from './voice-attack-recognizer';
import type { OraUtteranceCandidate } from './voice-attack-recognizer';

function utterance(
  transcript: string,
  startedAt: number,
  endedAt = startedAt + 100,
  intensity = 0.8,
): OraUtteranceCandidate {
  return { transcript, startedAt, endedAt, intensity };
}

describe('createOraVoiceAttackRecognizer', () => {
  it('「オラ！」を1hitへ変換し、開始時刻と音量を引き継ぐ', () => {
    const recognizer = createOraVoiceAttackRecognizer();

    const result = recognizer.recognize(utterance('オラ！', 1_000, 1_100, 0.8));

    expect(result).toEqual([{ hitAt: 1_000, intensity: 0.8, isRush: false }]);
  });

  it('「オラオラオラ！」を3hitへ展開し、3件目からORA RUSHになる', () => {
    const recognizer = createOraVoiceAttackRecognizer();

    const result = recognizer.recognize(utterance('オラオラオラ！', 1_000, 1_300, 0.9));

    expect(result).toEqual([
      { hitAt: 1_000, intensity: 0.9, isRush: false },
      { hitAt: 1_140, intensity: 0.9, isRush: false },
      { hitAt: 1_280, intensity: 0.9, isRush: true },
    ]);
  });

  it('句読点や長音記号を除去し、「おら」の連続もhitへ変換する', () => {
    const recognizer = createOraVoiceAttackRecognizer();

    const result = recognizer.recognize(utterance(' おらー、〜おら！ ', 0));

    expect(result).toHaveLength(2);
  });

  it('「オラ」が発話の主要部分でない通常会話は受理しない', () => {
    const recognizer = createOraVoiceAttackRecognizer();

    const result = recognizer.recognize(utterance('オラ大輔こっち来て', 0));

    expect(result).toEqual([]);
  });

  it('最低音量未満の発話は受理しない', () => {
    const recognizer = createOraVoiceAttackRecognizer({ minIntensity: 0.4 });

    const result = recognizer.recognize(utterance('オラ', 0, 100, 0.39));

    expect(result).toEqual([]);
  });

  it('既定の音量ゲートは無音近傍だけを除外し、0.05のキーワード発話を受理する', () => {
    const recognizer = createOraVoiceAttackRecognizer();

    expect(recognizer.recognize(utterance('オラ', 0, 100, 0.049))).toEqual([]);
    expect(
      recognizer.recognize(utterance('オラ', 200, 300, 0.05)).map((event) => event.intensity),
    ).toEqual([0.05]);
  });

  it('直前に受理した発話のCooldown内に始まる発話は受理しない', () => {
    const recognizer = createOraVoiceAttackRecognizer({ cooldownMs: 300 });
    const first = recognizer.recognize(utterance('オラ', 1_000, 1_100));

    const second = recognizer.recognize(utterance('オラ', 1_300, 1_400));

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it('複数発話のhitが1.2秒以内に累積すると3件目でORA RUSHになる', () => {
    const recognizer = createOraVoiceAttackRecognizer({ cooldownMs: 100 });

    const first = recognizer.recognize(utterance('オラ', 0, 100));
    const second = recognizer.recognize(utterance('オラ', 500, 600));
    const third = recognizer.recognize(utterance('オラ', 1_000, 1_100));

    expect([...first, ...second, ...third].map((event) => event.isRush)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('1発話内の「オラ」出現数をmaxHitsPerUtteranceまでClampする', () => {
    const recognizer = createOraVoiceAttackRecognizer({ maxHitsPerUtterance: 2 });

    const result = recognizer.recognize(utterance('オラオラオラオラ', 0));

    expect(result).toHaveLength(2);
    expect(result.map((event) => event.hitAt)).toEqual([0, 140]);
  });

  it('reset()でCooldownと過去のRush hit履歴を初期化する', () => {
    const recognizer = createOraVoiceAttackRecognizer({ cooldownMs: 300 });
    recognizer.recognize(utterance('オラオラ', 0, 100));

    recognizer.reset();
    const result = recognizer.recognize(utterance('オラ', 150, 250));

    expect(result).toEqual([{ hitAt: 150, intensity: 0.8, isRush: false }]);
  });
});
