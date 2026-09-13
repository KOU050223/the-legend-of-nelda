import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { createCombatStateMachine } from '../combat/state-machine';
import { createCombatVitals } from '../combat/vitals';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { INITIAL_BOSS_HP, INITIAL_SLEEPINESS } from '../config/combat-balance';
import { createBossAttackController, type AttackCueSettings } from './boss-attack';
import { yawnWave } from './yawn-wave';

/** 攻撃開始から着弾までの時間。TELEGRAPH を抜けてから hitAfterMs 後に当たる。 */
const HIT_AT = yawnWave.timings!.TELEGRAPH! + yawnWave.hitTiming.hitAfterMs;

function setup(cues?: AttackCueSettings) {
  const clock = createFakeClock();
  const eventBus = createGameEventBus();
  const events: GameEvent[] = [];
  eventBus.subscribe((event) => events.push(event));
  const vitals = createCombatVitals();
  let controller: ReturnType<typeof createBossAttackController>;
  const machine = createCombatStateMachine({
    clock,
    timings: { INTRO: 0 },
    resolveJudgement: (attack) => controller.resolveJudgement(attack),
    resolveBattleEnd: vitals.resolveBattleEnd,
  });
  controller = createBossAttackController({ clock, machine, vitals, eventBus });

  /** 指定した時刻まで時計を進める。攻撃開始を 0 とした相対時刻で書く。 */
  const advanceTo = (at: number) => {
    clock.advance(at - clock.now());
    controller.update();
    machine.update();
  };

  advanceTo(0);
  controller.start(cues ? { ...yawnWave, cues } : yawnWave);

  /**
   * 着弾からの符号付きオフセットで防御入力を送る。
   * 仕様の受付幅が着弾基準なので、テストも同じ座標系で書く。
   *
   * 時計を進めてから State Machine を回す前に入力を渡す。受付終了ちょうど
   * (+0.1秒) はまだ押せる瞬間で、そこで State を先に進めてしまうと
   * ATTACK を抜けたあとの入力になり、境界の1msを検証できなくなる。
   */
  const inputAt = (offsetMs: number, action: Parameters<typeof controller.submitAction>[0]) => {
    clock.advance(HIT_AT + offsetMs - clock.now());
    controller.update();
    const acceptance = controller.submitAction(action);
    machine.update();

    return acceptance;
  };

  /** 判定が終わるところまで進める。JUDGE は滞在時間を持たないので即座に抜ける。 */
  const runToJudge = () => advanceTo(HIT_AT + yawnWave.hitTiming.acceptToMs);

  const judged = () =>
    events.filter((event) => event.type === 'JUDGED').map((event) => event.result);

  return { advanceTo, clock, controller, events, inputAt, judged, machine, runToJudge, vitals };
}

describe('あくび衝撃波', () => {
  it('方向を持たない正面攻撃としてガードを正解に定義する', () => {
    expect(yawnWave).toMatchObject({
      id: 'YAWN_WAVE',
      type: 'YAWN_WAVE',
      direction: 'CENTER',
      correctAction: 'GUARD',
      damage: 15,
      sleepinessDamage: 18,
    });
  });

  // YAWN-001
  it('正しいタイミングのガードをJUST GUARDとして扱う', () => {
    const { inputAt, judged, machine, runToJudge, vitals } = setup();

    expect(inputAt(0, 'GUARD')).toBe('ACCEPTED');
    runToJudge();

    expect(judged()).toEqual(['JUST_GUARD']);
    expect(machine.state).toBe('COUNTER_WINDOW');
    expect(vitals.sleepiness).toBe(INITIAL_SLEEPINESS);
  });

  // YAWN-002 / YAWN-003
  it.each(['DODGE_LEFT', 'DODGE_RIGHT'] as const)('%s を入力すると失敗して被弾する', (action) => {
    const { inputAt, judged, machine, runToJudge, vitals } = setup();

    expect(inputAt(0, action)).toBe('ACCEPTED');
    runToJudge();

    expect(judged()).toEqual(['HIT']);
    expect(machine.state).toBe('HIT');
    expect(vitals.sleepiness).toBe(yawnWave.sleepinessDamage);
  });

  // YAWN-004
  it('受付開始より1ms早いガードは成功せず、早押しとして弾く', () => {
    const { events, inputAt, judged, machine, runToJudge, vitals } = setup();

    expect(inputAt(yawnWave.hitTiming.acceptFromMs - 1, 'GUARD')).toBe('TOO_EARLY');
    runToJudge();

    // 早押しは判定へ回らないので JUDGED を発行しない。採用された入力が
    // ないまま着弾するため、結果としては被弾する (INPUT-005)。
    expect(judged()).toEqual([]);
    expect(events).toContainEqual({
      type: 'INPUT_REJECTED',
      action: 'GUARD',
      reason: 'TOO_EARLY',
    });
    expect(machine.state).toBe('HIT');
    expect(vitals.sleepiness).toBe(yawnWave.sleepinessDamage);
  });

  // YAWN-005 / YAWN-006
  // 受付境界ちょうどは成功側に含める。ガードは着弾 -0.7秒 〜 +0.1秒 で、
  // 回避の基本受付 (-0.6秒) と開始が非対称になっている
  // (docs/single-player-poc-spec.md §12)。
  it.each([
    { label: 'ガード開始境界', offsetMs: -700 },
    { label: 'ガード終了境界', offsetMs: 100 },
  ])('$label ($offsetMs ms) のガードは成功する', ({ offsetMs }) => {
    const { inputAt, judged, machine, runToJudge } = setup();

    expect(inputAt(offsetMs, 'GUARD')).toBe('ACCEPTED');
    runToJudge();

    expect(judged()).toEqual(['JUST_GUARD']);
    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  // YAWN-007
  it('受付終了より1ms遅いガードは被弾する', () => {
    const { advanceTo, controller, judged, machine, vitals } = setup();

    // 受付終了を過ぎると ATTACK を抜けて JUDGE 済みなので、入力自体が
    // 判定対象を持たない。結果は「採用された入力なし」として被弾になる。
    advanceTo(HIT_AT + yawnWave.hitTiming.acceptToMs + 1);

    expect(controller.submitAction('GUARD')).toBe('LOCKED');
    expect(judged()).toEqual([]);
    expect(machine.state).toBe('HIT');
    expect(vitals.sleepiness).toBe(yawnWave.sleepinessDamage);
  });

  // YAWN-008
  it('JUST GUARD後に約2秒の反撃可能時間が続く', () => {
    const { advanceTo, inputAt, machine, runToJudge } = setup();

    inputAt(0, 'GUARD');
    runToJudge();
    const openedAt = machine.stateDeadline! - yawnWave.counterWindowMs;

    expect(yawnWave.counterWindowMs).toBe(2000);

    // 閉じる直前はまだ反撃可能で、閉じたあとは COUNTER_WINDOW を抜けている。
    advanceTo(openedAt + yawnWave.counterWindowMs - 1);
    expect(machine.state).toBe('COUNTER_WINDOW');

    advanceTo(openedAt + yawnWave.counterWindowMs);
    expect(machine.state).not.toBe('COUNTER_WINDOW');
  });

  // YAWN-009
  it('反撃成功でBoss HPが15減る', () => {
    const { advanceTo, controller, inputAt, machine, runToJudge, vitals } = setup();

    inputAt(0, 'GUARD');
    runToJudge();

    expect(machine.state).toBe('COUNTER_WINDOW');
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    advanceTo(machine.stateDeadline!);

    expect(vitals.bossHp).toBe(INITIAL_BOSS_HP - 15);
  });

  // YAWN-010
  it('被弾時のSLEEPINESS増加は1回だけ発生する', () => {
    const { advanceTo, machine, runToJudge, vitals } = setup();
    const hits: string[] = [];
    machine.onTransition(({ to }) => {
      if (to === 'HIT') {
        hits.push(to);
      }
    });

    runToJudge();
    // HIT を抜けて攻撃サイクルが閉じるところまで進めても、加算は増えない。
    advanceTo(HIT_AT + 10_000);

    expect(vitals.sleepiness).toBe(yawnWave.sleepinessDamage);
    expect(hits).toHaveLength(1);
  });

  // CUE-003
  it('Visual Cueを無効化しても攻撃判定は正常に進行する', () => {
    const { events, inputAt, judged, machine, runToJudge } = setup({ visual: false });

    expect(inputAt(0, 'GUARD')).toBe('ACCEPTED');
    runToJudge();

    expect(events.some((event) => event.type === 'ATTACK_VISUAL_CUE')).toBe(false);
    expect(events.some((event) => event.type === 'ATTACK_AUDIO_CUE')).toBe(true);
    expect(judged()).toEqual(['JUST_GUARD']);
    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  // CUE-004
  it('Audio Cueを無効化しても内部Hit Timingは変化しない', () => {
    const hitTimingOf = (cues?: AttackCueSettings) => {
      const { events, runToJudge } = setup(cues);
      runToJudge();

      return events.filter((event) => event.type === 'ATTACK_HIT_TIMING');
    };

    const withAudio = hitTimingOf();
    const silent = hitTimingOf({ audio: false });

    expect(silent).toEqual(withAudio);
    expect(silent).toEqual([{ type: 'ATTACK_HIT_TIMING', attackId: 'YAWN_WAVE', at: HIT_AT }]);
  });

  // CUE-006
  it('1サイクル中にVisual / Audio Cueを1回ずつしか発行しない', () => {
    const { advanceTo, events } = setup();

    advanceTo(HIT_AT + 10_000);

    expect(events.filter((event) => event.type === 'ATTACK_VISUAL_CUE')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'ATTACK_AUDIO_CUE')).toHaveLength(1);
  });

  // Cue は文字列IDだけを持ち、予兆の尺を添える。無音の分節は Audio 側の責務。
  it('Cueに予兆の長さを添えて発行する', () => {
    const { events } = setup();

    expect(events).toContainEqual({
      type: 'ATTACK_AUDIO_CUE',
      attackId: 'YAWN_WAVE',
      cue: yawnWave.audioCue,
      durationMs: yawnWave.timings!.TELEGRAPH,
    });
  });
});
