import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import {
  DEFAULT_COMBAT_TIMINGS,
  createCombatStateMachine,
  type JudgementOutcome,
} from './state-machine';
import { createCombatVitals, type CombatVitalsOptions } from './vitals';

/**
 * #5 の CombatVitals を #2 の State Machine の resolveBattleEnd へ実際に差し込む。
 *
 * State Machine 単体のテストではスタブで終了状態を返しているので
 * (SM-003 / SM-004)、ここでは「HPやSLEEPINESSの実値から終了状態が導かれるか」を見る。
 */
function setup(vitalsOptions: CombatVitalsOptions = {}) {
  const clock = createFakeClock();
  const vitals = createCombatVitals(vitalsOptions);
  /** 判定結果はケースごとに変える。勝利は COUNTER_WINDOW 経由、敗北は HIT 経由で起きる。 */
  let outcome: JudgementOutcome = 'SUCCESS';
  const machine = createCombatStateMachine({
    clock,
    resolveJudgement: () => outcome,
    resolveBattleEnd: () => vitals.resolveBattleEnd(),
  });

  const advance = (ms: number) => {
    clock.advance(ms);
    machine.update();
  };

  /** INTRO を抜けて IDLE まで進める。 */
  advance(DEFAULT_COMBAT_TIMINGS.INTRO);

  /** ATTACK を抜けて JUDGE の振り分けが済むところまで進める。 */
  const runUntilJudged = () => {
    machine.startAttack({ id: 'dummy' });
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
  };

  /** 反撃を成立させて DAMAGE 経由で1サイクル閉じる。 */
  const counterCycle = () => {
    outcome = 'SUCCESS';
    runUntilJudged();
    machine.registerCounter();
    advance(DEFAULT_COMBAT_TIMINGS.DAMAGE);
  };

  /** 判定を失敗させて HIT 経由で1サイクル閉じる。被弾の経路。 */
  const hitCycle = () => {
    outcome = 'FAILURE';
    runUntilJudged();
    advance(DEFAULT_COMBAT_TIMINGS.HIT);
  };

  return { machine, vitals, counterCycle, hitCycle };
}

describe('CombatVitals を State Machine へ接続する', () => {
  // SM-003
  it('反撃でボスHPが0になるとBOSS_DEFEATEDへ遷移する', () => {
    const { machine, vitals, counterCycle } = setup({ initialBossHp: 10 });

    vitals.applyCounterDamage('PILLOW_SWEEP');
    counterCycle();

    expect(machine.state).toBe('BOSS_DEFEATED');
  });

  it('ボスHPが残っていれば攻撃サイクルはIDLEへ戻る', () => {
    const { machine, vitals, counterCycle } = setup();

    vitals.applyCounterDamage('PILLOW_SWEEP');
    counterCycle();

    expect(machine.state).toBe('IDLE');
  });

  // SM-004。被弾は JUDGE → HIT を通るので、COUNTER_WINDOW 側とは別の経路になる。
  it('被弾でSLEEPINESSが100へ達するとPLAYER_LOSEへ遷移する', () => {
    const { machine, vitals, hitCycle } = setup();

    vitals.addSleepiness(99);
    vitals.applyAttackSleepiness('PILLOW_SWEEP');
    hitCycle();

    expect(machine.state).toBe('PLAYER_LOSE');
  });

  it('SLEEPINESSが上限未満なら被弾してもIDLEへ戻る', () => {
    const { machine, vitals, hitCycle } = setup();

    vitals.applyAttackSleepiness('PILLOW_SWEEP');
    hitCycle();

    expect(machine.state).toBe('IDLE');
  });
});
