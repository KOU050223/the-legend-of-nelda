import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { createCombatStateMachine, type CombatTimings } from '../combat/state-machine';
import { createCombatVitals } from '../combat/vitals';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { createBossAttackController, defineBossAttack } from './boss-attack';

const dummyAttack = defineBossAttack({
  id: 'PILLOW_SWEEP',
  type: 'DUMMY',
  direction: 'RIGHT',
  visualCue: 'pillow-pull',
  audioCue: 'wind-up',
  hitTiming: {
    hitAfterMs: 400,
    acceptFromMs: -600,
    acceptToMs: 100,
    perfectFromMs: -100,
    perfectToMs: 100,
  },
  correctAction: 'DODGE_LEFT',
  counterWindowMs: 1500,
  damage: 10,
  sleepinessDamage: 12,
});

function setup(timings: Partial<CombatTimings> = {}) {
  const clock = createFakeClock();
  const eventBus = createGameEventBus();
  const events: GameEvent[] = [];
  eventBus.subscribe((event) => events.push(event));
  const vitals = createCombatVitals();
  let controller: ReturnType<typeof createBossAttackController>;
  const machine = createCombatStateMachine({
    clock,
    timings: { INTRO: 0, TELEGRAPH: 2000, ATTACK: 500, ...timings },
    resolveJudgement: (attack) => controller.resolveJudgement(attack),
    resolveBattleEnd: vitals.resolveBattleEnd,
  });
  controller = createBossAttackController({ clock, machine, vitals, eventBus });

  const advance = (ms: number) => {
    clock.advance(ms);
    controller.update();
    machine.update();
  };

  advance(0);

  return { advance, clock, controller, eventBus, events, machine, vitals };
}

describe('共通ボス攻撃基盤', () => {
  // ATK-BASE-001
  it('攻撃定義が技種別・方向・Cue・着弾判定・反撃時間・ダメージを保持する', () => {
    expect(dummyAttack).toMatchObject({
      type: 'DUMMY',
      direction: 'RIGHT',
      visualCue: 'pillow-pull',
      audioCue: 'wind-up',
      hitTiming: { hitAfterMs: 400 },
      correctAction: 'DODGE_LEFT',
      counterWindowMs: 1500,
      damage: 10,
      sleepinessDamage: 12,
    });
  });

  // ATK-BASE-002 / ATK-BASE-003 / CUE-001 / CUE-002
  it.each([
    {
      cue: 'visual' as const,
      expected: ['ATTACK_STARTED', 'ATTACK_AUDIO_CUE', 'ATTACK_HIT_TIMING'],
    },
    {
      cue: 'audio' as const,
      expected: ['ATTACK_STARTED', 'ATTACK_VISUAL_CUE', 'ATTACK_HIT_TIMING'],
    },
  ])('$cue Cueを無効化しても攻撃サイクルと残るCueは動作する', ({ cue, expected }) => {
    const { advance, controller, events, machine } = setup();

    controller.start({ ...dummyAttack, cues: { [cue]: false } });
    advance(2000);
    advance(500);

    expect(machine.state).toBe('HIT');
    expect(events.map((event) => event.type)).toEqual(expected);
  });

  // ATK-BASE-004
  it('Visual CueとAudio Cueを別々の購読者へ通知する', () => {
    const { advance, controller, eventBus } = setup();
    const visualCues: GameEvent[] = [];
    const audioCues: GameEvent[] = [];
    eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_VISUAL_CUE') {
        visualCues.push(event);
      }
    });
    eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_AUDIO_CUE') {
        audioCues.push(event);
      }
    });

    controller.start(dummyAttack);
    advance(2000);

    expect(visualCues).toEqual([
      { type: 'ATTACK_VISUAL_CUE', attackId: 'PILLOW_SWEEP', cue: 'pillow-pull' },
    ]);
    expect(audioCues).toEqual([
      { type: 'ATTACK_AUDIO_CUE', attackId: 'PILLOW_SWEEP', cue: 'wind-up' },
    ]);
  });

  // ATK-BASE-005 と完了条件「ダミー攻撃を共通基盤経由で1サイクル実行」。
  it('ダミー攻撃を開始から反撃終了まで実行し、終了後の入力を受け付けない', () => {
    const { advance, controller, events, machine, vitals } = setup();

    const started = controller.start(dummyAttack);
    advance(2000);
    advance(400);
    const accepted = controller.submitAction('DODGE_LEFT');
    advance(100);
    const countered = controller.registerCounter();
    advance(400);
    const staleInputAccepted = controller.submitAction('DODGE_LEFT');

    expect(started).toBe(true);
    expect(accepted).toBe(true);
    expect(countered).toBe(true);
    expect(machine.state).toBe('IDLE');
    expect(vitals.bossHp).toBe(90);
    expect(staleInputAccepted).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      'ATTACK_STARTED',
      'ATTACK_VISUAL_CUE',
      'ATTACK_AUDIO_CUE',
      'ATTACK_HIT_TIMING',
      'JUDGED',
      'ATTACK_ENDED',
    ]);
  });

  it('進行中に次の攻撃開始を拒否しても、元の攻撃の入力判定を維持する', () => {
    const { advance, controller, machine } = setup();

    controller.start(dummyAttack);
    const secondStarted = controller.start({ ...dummyAttack, id: 'YAWN_WAVE', type: 'YAWN_WAVE' });
    advance(2000);
    advance(400);
    const accepted = controller.submitAction('DODGE_LEFT');
    advance(100);

    expect(secondStarted).toBe(false);
    expect(accepted).toBe(true);
    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  it('Cueをすべて無効にしても、攻撃の開始・着弾・終了をイベントで観測できる', () => {
    const { advance, controller, events } = setup();
    const { audioCue: _audioCue, visualCue: _visualCue, ...attackWithoutCues } = dummyAttack;

    controller.start(attackWithoutCues);
    advance(2000);
    advance(500);
    advance(1000);

    expect(events.map((event) => event.type)).toEqual([
      'ATTACK_STARTED',
      'ATTACK_HIT_TIMING',
      'ATTACK_ENDED',
    ]);
  });

  it('終了イベントの購読者が次の攻撃を始めても、その攻撃の状態とCueを維持する', () => {
    const { advance, controller, eventBus, events, machine } = setup();
    const nextAttack = { ...dummyAttack, id: 'YAWN_WAVE' as const, type: 'YAWN_WAVE' as const };
    eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_ENDED') {
        controller.start(nextAttack);
      }
    });

    controller.start(dummyAttack);
    advance(2000);
    advance(500);
    advance(1000);

    expect(machine.state).toBe('TELEGRAPH');
    expect(events).toContainEqual({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'YAWN_WAVE',
      cue: 'pillow-pull',
    });
  });

  it('入力時刻は攻撃開始後のゲーム時計から判定し、次の攻撃でも同じ受付幅を使う', () => {
    const { advance, controller, machine } = setup();

    controller.start(dummyAttack);
    advance(2000);
    advance(400);
    controller.submitAction('DODGE_LEFT');
    advance(100);
    controller.registerCounter();
    advance(400);
    controller.start(dummyAttack);
    advance(2000);
    advance(400);
    const acceptedAtHit = controller.submitAction('DODGE_LEFT');
    advance(100);

    expect(acceptedAtHit).toBe(true);
    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  it('着弾から+100msちょうどの正解入力を成功として扱う', () => {
    const { advance, clock, controller, machine } = setup();

    controller.start(dummyAttack);
    advance(2000);
    advance(400);
    clock.advance(100);
    const acceptedAtWindowEnd = controller.submitAction('DODGE_LEFT');
    machine.update();

    expect(acceptedAtWindowEnd).toBe(true);
    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  it('State MachineのTELEGRAPH時間を上書きしても、実際のATTACK開始から入力を判定する', () => {
    const { advance, controller, machine } = setup({ TELEGRAPH: 100 });

    controller.start(dummyAttack);
    advance(100);
    advance(400);
    controller.submitAction('DODGE_LEFT');
    advance(100);

    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  it('Hit Timing Eventには実際の着弾時刻を含め、受付終了まで遅延させない', () => {
    const { advance, controller, events } = setup();

    controller.start(dummyAttack);
    advance(2000);
    advance(400);

    expect(events).toContainEqual({
      type: 'ATTACK_HIT_TIMING',
      attackId: 'PILLOW_SWEEP',
      at: 2400,
    });
  });

  it('更新が遅れても論理上の着弾時刻を基準に入力を判定する', () => {
    const { clock, controller, events, machine } = setup();

    controller.start(dummyAttack);
    clock.advance(2500);
    controller.submitAction('DODGE_LEFT');
    controller.update();
    machine.update();

    expect(machine.state).toBe('COUNTER_WINDOW');
    expect(events).toContainEqual({
      type: 'ATTACK_HIT_TIMING',
      attackId: 'PILLOW_SWEEP',
      at: 2400,
    });
  });
});
