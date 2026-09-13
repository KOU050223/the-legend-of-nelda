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

/** シーケンスの1手。チュートリアルも本戦もこの1つの型で表す。 */
export interface SequenceStepDefinition {
  slot: SequenceSlot;
  phase: SequencePhase;
  /**
   * 操作補助表示 (`← / → DODGE` など) を出すか。
   *
   * phase から導出しない。仕様 §16 のチュートリアル5手のうち 2手目・4手目は
   * 「通常判定」で、同じ技をもう一度補助なしで体験させる段になっている
   * (SEQ-001)。phase だけで補助を決めると、この Tutorial / Normal の区別が
   * 消えてしまう。
   */
  assist: boolean;
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
 * チュートリアルの既定順。docs/single-player-poc-spec.md §16 / SEQ-001。
 *
 * 1. 枕薙ぎ払い：左右回避を学習 (補助あり)
 * 2. 枕薙ぎ払い：通常判定 + 反撃 (補助なし)
 * 3. あくび衝撃波：ガードを学習 (補助あり)
 * 4. あくび衝撃波：無音キューを意識 (補助なし)
 * 5. ふかふか布団：回避→攻撃の2段階入力を学習 (補助あり)
 */
export const DEFAULT_TUTORIAL_SEQUENCE: readonly SequenceStepDefinition[] = [
  { slot: 'PILLOW_SWEEP', phase: 'TUTORIAL', assist: true },
  { slot: 'PILLOW_SWEEP', phase: 'TUTORIAL', assist: false },
  { slot: 'YAWN_WAVE', phase: 'TUTORIAL', assist: true },
  { slot: 'YAWN_WAVE', phase: 'TUTORIAL', assist: false },
  { slot: 'FLUFFY_FUTON', phase: 'TUTORIAL', assist: true },
];

/**
 * 本戦の既定順。docs/single-player-poc-spec.md §17 / SEQ-005。
 *
 * 本戦では補助表示を出さない。答えそのものを見せる UI は本戦で使わない
 * と仕様 §19 が定めているため (SEQ-004)。
 */
export const DEFAULT_MAIN_SEQUENCE: readonly SequenceStepDefinition[] = [
  { slot: 'PILLOW_SWEEP', phase: 'MAIN', assist: false },
  { slot: 'YAWN_WAVE', phase: 'MAIN', assist: false },
  { slot: 'PILLOW_SWEEP', phase: 'MAIN', assist: false },
  { slot: 'YAWN_WAVE', phase: 'MAIN', assist: false },
  { slot: 'FLUFFY_FUTON', phase: 'MAIN', assist: false },
  { slot: 'PILLOW_OR_YAWN', phase: 'MAIN', assist: false },
  { slot: 'FLUFFY_FUTON', phase: 'MAIN', assist: false },
];

export interface AttackSequenceOptions {
  /** 方向とランダム枠の解決に使う乱数。省略時は Math.random。 */
  random?: () => number;
  /** チュートリアル順の差し替え。空配列を渡せばチュートリアルを飛ばせる。 */
  tutorial?: readonly SequenceStepDefinition[];
  /** 本戦の攻撃順の差し替え (完了条件「本戦の攻撃順を設定から調整できる」)。 */
  mainBattle?: readonly SequenceStepDefinition[];
}

export interface AttackSequence {
  /**
   * 次の1手を取り出して進める。
   *
   * 本戦を出し切ったあとは末尾の手を繰り返す。仕様のタイムライン (§17) は
   * 全成功で撃破できる長さだが、被弾が続くとボスHPを残したまま列を使い切る。
   * そこで停止すると IDLE のまま戦闘が動かなくなり、完了条件「最終ふかふか布団まで
   * 1戦を通して進行できる」も、敗北 (SLEEPINESS 100%) も成立しなくなるため、
   * 決着がつくまで最後の手を出し続ける。仕様に記述が無いための暫定判断。
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
function createAttack(attackId: AttackId, random: () => number): BossAttack {
  if (attackId === 'PILLOW_SWEEP') {
    return createPillowSweep({ random });
  }

  if (attackId === 'FLUFFY_FUTON') {
    return createFluffyFutonAttack({ random });
  }

  // あくび衝撃波は正面技で方向を持たないため、定義を使い回せる。
  return yawnWave;
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
}: AttackSequenceOptions = {}): AttackSequence {
  const steps: readonly SequenceStepDefinition[] = [...tutorial, ...mainBattle];

  if (steps.length === 0) {
    throw new Error('攻撃シーケンスが空です。チュートリアルか本戦のどちらかに1手以上必要です。');
  }

  let index = 0;

  /** index 番目の手。使い切ったあとは末尾の手を返し続ける。 */
  function definitionAt(position: number): SequenceStepDefinition {
    const clamped = Math.min(position, steps.length - 1);

    // noUncheckedIndexedAccess のための既定。clamped は必ず範囲内。
    return steps[clamped] ?? steps[steps.length - 1]!;
  }

  return {
    next() {
      const definition = definitionAt(index);
      const attackId = resolveSlot(definition.slot, random);
      const step: SequenceStep = {
        index,
        phase: definition.phase,
        assist: definition.assist,
        attackId,
        attack: createAttack(attackId, random),
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
