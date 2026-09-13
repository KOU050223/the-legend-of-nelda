import {
  ATTACK_IDS,
  DEFAULT_ATTACK_DAMAGE,
  INITIAL_BOSS_HP,
  INITIAL_SLEEPINESS,
  MAX_SLEEPINESS,
  type AttackDamage,
  type AttackId,
} from '../config/combat-balance';
import type { GameEventBus } from '../events/game-event';
import type { TerminalState } from './state-machine';

/**
 * Boss HP と HORI SLEEPINESS を持つ。docs/single-player-poc-spec.md §4 / §5。
 *
 * React / Three.js / zustand へ依存しない Pure TypeScript
 * (docs/technical-design.md §5.1)。表示側は GameEventBus を購読して
 * 自分の State を更新する。ここから Presentation を直接触らない。
 *
 * 勝敗は「イベントを発行する」のではなく resolveBattleEnd() で問い合わせる形にする。
 * State Machine の終了状態 (BOSS_DEFEATED / PLAYER_LOSE) は吸収状態なので、
 * 真実源を State Machine 側に一本化しておけば勝敗の多重発火が構造的に起きない
 * (RESULT-004 / RESULT-005)。
 */
export interface CombatVitals {
  readonly bossHp: number;
  readonly sleepiness: number;

  /**
   * ボスHPの最大値 (= 初期値)。
   * ゲージの分母は options で上書きできるため、表示側が
   * INITIAL_BOSS_HP を直接読むと上書き時に割合がずれる。
   */
  readonly bossHpMax: number;

  /** SLEEPINESS の上限 (= 敗北しきい値)。割合表示の分母。 */
  readonly sleepinessMax: number;

  /**
   * ボスHPを減らす。負値を渡すと回復になる。
   * 0未満にも初期HP超にもならない (HP-005)。
   * @returns 適用後のボスHP。
   */
  readonly damageBoss: (amount: number) => number;

  /**
   * プレイヤーの眠気を増やす。負値を渡すと減衰になる。
   * 0未満にも上限超にもならない (HP-008)。
   * @returns 適用後の SLEEPINESS。
   */
  readonly addSleepiness: (amount: number) => number;

  /** 反撃成功として、その技の bossDamage をボスへ与える。 */
  readonly applyCounterDamage: (attackId: AttackId) => number;

  /** 被弾として、その技の sleepinessDamage をプレイヤーへ与える。 */
  readonly applyAttackSleepiness: (attackId: AttackId) => number;

  /**
   * 戦闘終了なら終了状態を返す。継続中なら null。
   * createCombatStateMachine の resolveBattleEnd へそのまま渡せる形にしてある。
   *
   * 呼び出し側の制約: State Machine は HIT / DAMAGE / COUNTER_WINDOW を
   * 抜ける「直前」にこれを問い合わせる (state-machine.ts の closeCycle)。
   * ダメージの適用がそれより後になると、その周回の勝敗判定に間に合わず
   * 終了状態が1サイクル遅れる。#4 / #12 で配線する際は HIT / DAMAGE へ
   * 入った時点で damageBoss / addSleepiness を済ませておく。
   */
  readonly resolveBattleEnd: () => TerminalState | null;

  /** 初期値へ戻す (RESULT-008 Restart)。 */
  readonly reset: () => void;
}

export interface CombatVitalsOptions {
  /** 値の変化を通知する先。省略時は誰にも通知しない。 */
  eventBus?: GameEventBus;
  /** ボスHPの初期値。省略時は仕様の100。 */
  initialBossHp?: number;
  /** SLEEPINESS の上限。到達で敗北。省略時は仕様の100。 */
  maxSleepiness?: number;
  /** 技ごとのダメージ量の上書き。プレイテストでの調整とテスト用。 */
  attackDamage?: Partial<Record<AttackId, Partial<AttackDamage>>>;
}

/**
 * 上書きを既定値へ重ねて、全技ぶんのダメージ表を作る。
 * 上書きは技ごと・項目ごとの部分指定を許すので、浅いマージでは足りない。
 */
function resolveAttackDamage(
  overrides: CombatVitalsOptions['attackDamage'],
): Record<AttackId, AttackDamage> {
  const merged: Record<AttackId, AttackDamage> = { ...DEFAULT_ATTACK_DAMAGE };

  for (const id of ATTACK_IDS) {
    merged[id] = { ...DEFAULT_ATTACK_DAMAGE[id], ...overrides?.[id] };
  }

  return merged;
}

export function createCombatVitals(options: CombatVitalsOptions = {}): CombatVitals {
  const {
    eventBus,
    initialBossHp = INITIAL_BOSS_HP,
    maxSleepiness = MAX_SLEEPINESS,
    attackDamage,
  } = options;

  const damageTable = resolveAttackDamage(attackDamage);

  let bossHp = initialBossHp;
  let sleepiness = INITIAL_SLEEPINESS;

  /**
   * 値が実際に動いたときだけ通知する。
   * 0でClampされた後の重複ダメージまで購読側へ流すと、
   * 演出が実際には変化していない値で再生されてしまう。
   */
  function setBossHp(next: number): number {
    if (next === bossHp) {
      return bossHp;
    }

    bossHp = next;
    eventBus?.emit({ type: 'BOSS_HP_CHANGED', hp: bossHp });

    return bossHp;
  }

  function setSleepiness(next: number): number {
    if (next === sleepiness) {
      return sleepiness;
    }

    sleepiness = next;
    eventBus?.emit({ type: 'SLEEPINESS_CHANGED', value: sleepiness });

    return sleepiness;
  }

  /**
   * ボスHPを増減する。負値を渡せば回復になるため、初期HPと0の両端で止める。
   * (Issue #5「Boss HPを増減・参照できる」)
   */
  function damageBoss(amount: number): number {
    return setBossHp(Math.min(initialBossHp, Math.max(0, bossHp - amount)));
  }

  /** SLEEPINESS を増減する。負値を渡せば減衰になるため、0と上限の両端で止める。 */
  function addSleepiness(amount: number): number {
    return setSleepiness(Math.min(maxSleepiness, Math.max(0, sleepiness + amount)));
  }

  // メソッドとして呼ばれるとは限らないので this を使わない。
  // #4 / #6 の攻撃ハンドラへ関数だけを渡せるようにしておく。
  return {
    get bossHp() {
      return bossHp;
    },

    get sleepiness() {
      return sleepiness;
    },

    bossHpMax: initialBossHp,

    sleepinessMax: maxSleepiness,

    damageBoss,

    addSleepiness,

    applyCounterDamage(attackId) {
      return damageBoss(damageTable[attackId].bossDamage);
    },

    applyAttackSleepiness(attackId) {
      return addSleepiness(damageTable[attackId].sleepinessDamage);
    },

    resolveBattleEnd() {
      // 勝利を先に見る。相打ちになる状況 (HP0 かつ SLEEPINESS 100) は
      // 反撃が成立している側なので勝ちとして扱う。
      if (bossHp <= 0) {
        return 'BOSS_DEFEATED';
      }

      if (sleepiness >= maxSleepiness) {
        return 'PLAYER_LOSE';
      }

      return null;
    },

    reset() {
      setBossHp(initialBossHp);
      setSleepiness(INITIAL_SLEEPINESS);
    },
  };
}
