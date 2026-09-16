import { createFluffyFutonAttack } from '../attacks/fluffy-futon';
import { createPillowSweep } from '../attacks/pillow-sweep';
import { yawnWave } from '../attacks/yawn-wave';
import type { BossAttack } from '../attacks/boss-attack';
import type { AttackId } from '../config/combat-balance';

/**
 * チュートリアルから本戦までの出題順。
 * docs/single-player-poc-spec.md §16 / §17、docs/tests/phase1-single-player-test-spec.md §12。
 *
 * State Machine は「どの State に何ms留まるか」しか知らないので、
 * 「次に何の技を出すか」はここが単独で持つ。時計・イベントバス・store へは
 * 依存させず、Pure TypeScript のままにしておく (docs/technical-design.md §5.1)。
 */

/** ステップがチュートリアルか本戦か。補助表示の有無とは別で、進行の段を表す。 */
export type SequencePhase = 'TUTORIAL' | 'MAIN';

/**
 * 出題する技の指定。
 *
 * `PILLOW_OR_YAWN` は「枕 or あくびをランダム」(仕様 §17 の 52〜60秒) を
 * 技IDそのものではなくスロットとして持つための値。解決は next() の中で
 * 注入された乱数を引くので、テストは FixedRandom で枠を固定できる (SEQ-006)。
 */
export type SequenceSlot = AttackId | 'PILLOW_OR_YAWN';

/**
 * シーケンスの1手。チュートリアルも本戦もこの1つの型で表す。
 *
 * `phase` は持たない。どちらの段かは「チュートリアル配列と本戦配列の
 * どちらに置いたか」だけで決まり、定義側からは指定させない。指定できると
 * 本戦の配列へ `phase: 'TUTORIAL'` を混ぜられてしまい、段の表示が
 * 本戦に入っても切り替わらない設定を作れてしまう (SEQ-002)。
 */
export interface SequenceStepDefinition {
  slot: SequenceSlot;
  /**
   * 操作補助表示 (`← / → DODGE` など) を出すか。
   *
   * 段から導出しない。仕様 §16 のチュートリアル5手のうち 2手目・4手目は
   * 「通常判定」で、同じ技をもう一度補助なしで体験させる段になっている
   * (SEQ-001)。段だけで補助を決めると、この Tutorial / Normal の区別が
   * 消えてしまう。
   */
  assist: boolean;
  /**
   * この手だけに掛けるダメージ倍率。省略時は等倍。
   *
   * チュートリアルを「安全に体験させる」ために使う (仕様 §16)。技の定義を
   * 弱くするのではなく出題側が手ごとに掛けるので、同じ技が本戦で出たときは
   * 通常の数値に戻る。
   */
  damageScale?: {
    /** 反撃が入ったときのボスHPダメージ倍率。 */
    boss?: number;
    /** 被弾したときの SLEEPINESS 倍率。 */
    sleepiness?: number;
  };
}

/** next() が返す、実際に出す1手。 */
export interface SequenceStep {
  /** シーケンス全体を通した0始まりの通し番号。 */
  index: number;
  phase: SequencePhase;
  assist: boolean;
  /** スロットを解決した後の技ID。ランダム枠もここでは確定している。 */
  attackId: AttackId;
  /** この手で使う攻撃定義。方向の乱数もこの時点で引き終えている。 */
  attack: BossAttack;
}

/**
 * チュートリアルの反撃はボスHPを削らない。
 *
 * 仕様 §17 のタイムラインはダメージ量を本戦の行にだけ書いており
 * (「12〜19秒 枕薙ぎ払い 本番。反撃：約10ダメージ」に対し、
 * 「5〜12秒 枕薙ぎ払い チュートリアル」には記載が無い)、本戦7手の
 * 反撃だけでボスHP100をちょうど削り切る数値になっている
 * (10+15+10+15+30+10〜15 に最終布団の30)。§5 の「5〜7回程度の成功で撃破」
 * とも手数が合う。チュートリアルの反撃も等倍で通すと、全成功した
 * プレイヤーほど早くボスが落ち、最終ふかふか布団に到達できない。
 *
 * 被弾側は §16 の「初回失敗時のペナルティは軽くする」に合わせて半減する。
 * 補助表示を出す手 = 初めてその技に触る手なので、そこだけを軽くする。
 */
const TUTORIAL_ASSISTED_SCALE = { boss: 0, sleepiness: 0.5 } as const;

/**
 * チュートリアルの手に当てる既定の倍率。
 *
 * 既定配列へ直接書かず、チュートリアル配列に置かれた手すべてへここから当てる。
 * 呼び出し側が `tutorialSequence` を素の `{ slot, assist }` で書き直しても
 * 倍率が落ちないようにするため。書いた場所によって安全かどうかが変わると、
 * 仕様どおりの5手を手で書き直しただけでボスHPが 80 削れて早期撃破に戻る。
 */
function tutorialDamageScale(assist: boolean): NonNullable<SequenceStepDefinition['damageScale']> {
  return assist ? TUTORIAL_ASSISTED_SCALE : TUTORIAL_NORMAL_SCALE;
}

/**
 * チュートリアルの手の倍率を、段の既定と明示指定から1つに畳む。
 *
 * 項目ごとに畳むのが要点。オブジェクト単位で `??` すると、
 * `{ sleepiness: 0.25 }` のように片方だけ指定した手から `boss: 0` が落ち、
 * チュートリアルの反撃がボスHPを削って早期撃破に戻る。
 * 明示された値は 0 でも 1 でもそのまま尊重する (`??` であって `||` ではない)。
 */
function mergeTutorialDamageScale(
  definition: SequenceStepDefinition,
): NonNullable<SequenceStepDefinition['damageScale']> {
  const defaults = tutorialDamageScale(definition.assist);
  const boss = definition.damageScale?.boss ?? defaults.boss;
  const sleepiness = definition.damageScale?.sleepiness ?? defaults.sleepiness;

  // exactOptionalPropertyTypes のため、決まらなかったキーは持たせない。
  return {
    ...(boss === undefined ? {} : { boss }),
    ...(sleepiness === undefined ? {} : { sleepiness }),
  };
}

/**
 * チュートリアルの「通常判定」の手 (仕様 §16 の2手目・4手目)。
 * 被弾は本戦と同じ重さに戻すが、ボスHPはまだ削らない。
 */
const TUTORIAL_NORMAL_SCALE = { boss: 0 } as const;

/**
 * チュートリアルの既定順。docs/single-player-poc-spec.md §16 / SEQ-001。
 *
 * 1. 枕薙ぎ払い：左右回避を学習 (補助あり)
 * 2. 枕薙ぎ払い：通常判定 + 反撃 (補助なし)
 * 3. あくび衝撃波：ガードを学習 (補助あり)
 * 4. あくび衝撃波：無音キューを意識 (補助なし)
 * 5. ふかふか布団：回避→攻撃の2段階入力を学習 (補助あり)
 */
export const DEFAULT_TUTORIAL_SEQUENCE: readonly SequenceStepDefinition[] = [
  { slot: 'PILLOW_SWEEP', assist: true },
  { slot: 'PILLOW_SWEEP', assist: false },
  { slot: 'YAWN_WAVE', assist: true },
  { slot: 'YAWN_WAVE', assist: false },
  { slot: 'FLUFFY_FUTON', assist: true },
];

/**
 * 本戦の既定順。docs/single-player-poc-spec.md §17 / SEQ-005。
 *
 * 本戦では補助表示を出さない。答えそのものを見せる UI は本戦で使わない
 * と仕様 §19 が定めているため (SEQ-004)。
 */
export const DEFAULT_MAIN_SEQUENCE: readonly SequenceStepDefinition[] = [
  { slot: 'PILLOW_SWEEP', assist: false },
  { slot: 'YAWN_WAVE', assist: false },
  { slot: 'PILLOW_SWEEP', assist: false },
  { slot: 'YAWN_WAVE', assist: false },
  { slot: 'FLUFFY_FUTON', assist: false },
  { slot: 'PILLOW_OR_YAWN', assist: false },
  { slot: 'FLUFFY_FUTON', assist: false },
];

export interface AttackSequenceOptions {
  /** 方向とランダム枠の解決に使う乱数。省略時は Math.random。 */
  random?: () => number;
  /** チュートリアル順の差し替え。空配列を渡せばチュートリアルを飛ばせる。 */
  tutorial?: readonly SequenceStepDefinition[];
  /** 本戦の攻撃順の差し替え (完了条件「本戦の攻撃順を設定から調整できる」)。 */
  mainBattle?: readonly SequenceStepDefinition[];
  /**
   * Intentional Bug「布団に入らず吹き飛ぶ」の抽選 (Issue #140 / #42)。
   *
   * 既定は「抽選しない」。`random` へ相乗りさせないのは fluffy-futon.ts と
   * 同じ理由で、出題順を固定しただけのテストを確率へ巻き込まないため。
   */
  blowAway?: () => boolean;
}

export interface AttackSequence {
  /**
   * 次の1手を取り出して進める。
   *
   * 本戦を出し切ったあとは本戦の末尾の手を繰り返す。仕様のタイムライン (§17) は
   * 全成功で撃破できる長さだが、被弾が続くとボスHPを残したまま列を使い切る。
   * そこで停止すると IDLE のまま戦闘が動かなくなり、完了条件「最終ふかふか布団まで
   * 1戦を通して進行できる」も、敗北 (SLEEPINESS 100%) も成立しなくなるため、
   * 決着がつくまで最後の手を出し続ける。仕様に記述が無いための暫定判断。
   *
   * 繰り返すのは本戦の手だけで、チュートリアルは必ず出し切って本戦へ渡す
   * (SEQ-002)。チュートリアルの手を繰り返すと本戦へ入れなくなる。
   */
  next(): SequenceStep;
  /** 現在の段。まだ1手も出していなければ先頭のステップの段を返す。 */
  readonly phase: SequencePhase;
  /** 出した手の数。次に返る手の index と同じ。 */
  readonly index: number;
  /** 初期位置へ戻す (RESULT-008 の「Attack Sequence位置」)。 */
  reset(): void;
}

/** ランダム枠を1つの技へ解決する。仕様 §17「枕またはあくびをランダム」。 */
function resolveSlot(slot: SequenceSlot, random: () => number): AttackId {
  if (slot !== 'PILLOW_OR_YAWN') {
    return slot;
  }

  return random() < 0.5 ? 'PILLOW_SWEEP' : 'YAWN_WAVE';
}

/**
 * 技IDから攻撃定義を作る。
 *
 * 方向を持つ技は呼ぶたびに乱数を引き直すので、同じ技が2度出ても
 * 左右が固定されない (完了条件「左右ランダムに発動する」)。
 */
function createAttack(
  attackId: AttackId,
  random: () => number,
  damageScale: SequenceStepDefinition['damageScale'],
  blowAway: () => boolean,
): BossAttack {
  const base =
    attackId === 'PILLOW_SWEEP'
      ? createPillowSweep({ random })
      : attackId === 'FLUFFY_FUTON'
        ? createFluffyFutonAttack({ random, blowAway })
        : // あくび衝撃波は正面技で方向を持たないため、定義を使い回せる。
          yawnWave;

  // 倍率はこの1手にだけ載せる。共有している yawnWave の定義を
  // 書き換えないよう、必ず新しいオブジェクトにして返す。
  return damageScale ? { ...base, damageScale } : base;
}

/**
 * チュートリアル → 本戦の出題順を作る。
 *
 * 副作用は内部の位置カウンタだけで、時間も State Machine も見ない。
 * 「IDLE になったら next() を1回引く」呼び出し側の責務と切り分けてある。
 */
export function createAttackSequence({
  random = Math.random,
  tutorial = DEFAULT_TUTORIAL_SEQUENCE,
  mainBattle = DEFAULT_MAIN_SEQUENCE,
  blowAway = () => false,
}: AttackSequenceOptions = {}): AttackSequence {
  // 本戦が空だと、チュートリアルを出し切ったあとに繰り返す手が
  // チュートリアル側のものしか無くなり、本戦へ入れないまま止まる (SEQ-002)。
  if (mainBattle.length === 0) {
    throw new Error('本戦の攻撃順が空です。本戦には1手以上必要です。');
  }

  // 段は配列の由来だけで決める。定義側に持たせないことで、本戦の配列に
  // チュートリアルの段が混ざる設定を作れなくする (SEQ-002 / SEQ-004)。
  const steps: readonly { definition: SequenceStepDefinition; phase: SequencePhase }[] = [
    ...tutorial.map((definition) => ({
      // 段の既定と明示指定を項目ごとに畳む。明示されていればそちらを使う。
      definition: {
        ...definition,
        damageScale: mergeTutorialDamageScale(definition),
      },
      phase: 'TUTORIAL' as const,
    })),
    ...mainBattle.map((definition) => ({ definition, phase: 'MAIN' as const })),
  ];

  let index = 0;

  /**
   * index 番目の手。使い切ったあとは本戦の末尾の手を返し続ける。
   * 繰り返しの対象を本戦に限ることで、チュートリアルは必ず有限回で終わる。
   */
  function definitionAt(position: number): {
    definition: SequenceStepDefinition;
    phase: SequencePhase;
  } {
    const clamped = Math.min(position, steps.length - 1);

    // noUncheckedIndexedAccess のための既定。clamped は必ず範囲内で、
    // 末尾は本戦の最後の手 (mainBattle は空でないことを上で保証している)。
    return steps[clamped] ?? steps[steps.length - 1]!;
  }

  return {
    next() {
      const { definition, phase } = definitionAt(index);
      const attackId = resolveSlot(definition.slot, random);
      const step: SequenceStep = {
        index,
        phase,
        assist: definition.assist,
        attackId,
        attack: createAttack(attackId, random, definition.damageScale, blowAway),
      };

      index += 1;

      return step;
    },

    get phase() {
      return definitionAt(index).phase;
    },

    get index() {
      return index;
    },

    reset() {
      index = 0;
    },
  };
}
