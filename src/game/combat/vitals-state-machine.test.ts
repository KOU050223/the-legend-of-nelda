import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { DEFAULT_COMBAT_TIMINGS, createCombatStateMachine } from './state-machine';
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
  const machine = createCombatStateMachine({
    clock,
    resolveJudgement: () => 'SUCCESS',
    resolveBattleEnd: () => vitals.resolveBattleEnd(),
  });

  const advance = (ms: number) => {
    clock.advance(ms);
    machine.update();
  };

  /** INTRO を抜けて IDLE まで進める。 */
  advance(DEFAULT_COMBAT_TIMINGS.INTRO);

  /** 反撃を成立させて1サイクル閉じる。 */
  const counterCycle = () => {
    machine.startAttack({ id: 'dummy' });
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    machine.registerCounter();
    advance(DEFAULT_COMBAT_TIMINGS.DAMAGE);
  };

  return { machine, vitals, counterCycle };
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

  // SM-004
  it('被弾でSLEEPINESSが100へ達するとPLAYER_LOSEへ遷移する', () => {
    const { machine, vitals, counterCycle } = setup();

    vitals.addSleepiness(99);
    vitals.applyAttackSleepiness('PILLOW_SWEEP');
    counterCycle();

    expect(machine.state).toBe('PLAYER_LOSE');
  });
});
