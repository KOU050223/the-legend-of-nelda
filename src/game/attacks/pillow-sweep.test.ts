import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { createCombatStateMachine } from '../combat/state-machine';
import { createCombatVitals } from '../combat/vitals';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { DEFAULT_ATTACK_DAMAGE, INITIAL_BOSS_HP } from '../config/combat-balance';
import { createBossAttackController, type BossAttack } from './boss-attack';
import {
  correctDodgeFor,
  createPillowSweep,
  pickPillowSweepDirection,
  type PillowSweepDirection,
} from './pillow-sweep';

const PILLOW_DAMAGE = DEFAULT_ATTACK_DAMAGE.PILLOW_SWEEP;

function setup() {
  const clock = createFakeClock();
  const eventBus = createGameEventBus();
  const events: GameEvent[] = [];
  eventBus.subscribe((event) => events.push(event));
  const vitals = createCombatVitals({ eventBus });
  let controller: ReturnType<typeof createBossAttackController>;
  const machine = createCombatStateMachine({
    clock,
    // 攻撃サイクルの長さは技定義が持つので、ここでは INTRO を飛ばすだけにする。
    timings: { INTRO: 0 },
    resolveJudgement: (attack) => controller.resolveJudgement(attack),
    resolveBattleEnd: vitals.resolveBattleEnd,
  });
  controller = createBossAttackController({ clock, machine, vitals, eventBus });

  /**
   * 実機の1フレームに合わせて、時間を進める → 入力を読む → State を進める、の順にする。
   * 入力の受付と State 遷移を同じ update に畳むと、受付終了境界 (着弾 +0.1秒) で
   * 入力より先に JUDGE へ抜けてしまい、境界の挙動を観測できない。
   */
  const advance = (ms: number, onFrame?: () => void) => {
    clock.advance(ms);
    controller.update();
    onFrame?.();
    machine.update();
  };

  advance(0);

  return { advance, clock, controller, eventBus, events, machine, vitals };
}

/** 攻撃開始から着弾までの時間 (ms)。TELEGRAPH を抜けて ATTACK 内の着弾点へ至る。 */
function hitAtFromStart(attack: BossAttack): number {
  return (attack.timings?.TELEGRAPH ?? 0) + attack.hitTiming.hitAfterMs;
}

/**
 * 枕薙ぎ払いを開始し、着弾時刻から `offsetMs` だけずれた時点で `onFrame` を呼ぶ。
 * offsetMs が負なら着弾前、正なら着弾後。時間は攻撃開始からの絶対位置で進めるので、
 * 着弾前のオフセットでも時間を巻き戻さない。
 */
function startAndActAtHitOffset(
  context: ReturnType<typeof setup>,
  direction: PillowSweepDirection,
  offsetMs: number,
  onFrame?: () => void,
) {
  const attack = createPillowSweep({ direction });
  context.controller.start(attack);
  context.advance(hitAtFromStart(attack) + offsetMs, onFrame);

  return attack;
}

describe('枕薙ぎ払い', () => {
  // 完了条件「左右ランダムに発動する」。乱数を差し替えて両方の枝を確認する。
  it('乱数に応じて左右どちらの方向でも発動する', () => {
    expect(pickPillowSweepDirection(() => 0)).toBe('LEFT');
    expect(pickPillowSweepDirection(() => 0.99)).toBe('RIGHT');
    expect(createPillowSweep({ random: () => 0 }).direction).toBe('LEFT');
    expect(createPillowSweep({ random: () => 0.99 }).direction).toBe('RIGHT');
  });

  // 完了条件「構え / 溜め / 発動 / 硬直が分かれている」。
  // 構え+溜め → TELEGRAPH、発動 → ATTACK、硬直 → COUNTER_WINDOW に対応する。
  it('予兆1.3秒のあと0.4秒の攻撃判定へ入り、正解方向の回避で1.5秒の反撃可能状態になる', () => {
    const context = setup();
    const attack = createPillowSweep({ direction: 'RIGHT' });

    context.controller.start(attack);
    expect(context.machine.state).toBe('TELEGRAPH');
    // 構え (0.5秒) と溜め (0.8秒) を合わせた 1.3秒が TELEGRAPH の長さ。
    expect(attack.timings?.TELEGRAPH).toBe(1300);

    context.advance(attack.timings?.TELEGRAPH ?? 0);
    expect(context.machine.state).toBe('ATTACK');
    // 発動は着弾 (0.3秒) + 受付終了 (+0.1秒) の 0.4秒。仕様の 0.3〜0.4秒に収まる。
    expect(attack.timings?.ATTACK).toBe(400);

    context.advance(attack.hitTiming.hitAfterMs, () => {
      context.controller.submitAction(correctDodgeFor('RIGHT'));
    });
    context.advance(100);
    // 硬直 = 反撃可能時間。
    expect(context.machine.state).toBe('COUNTER_WINDOW');
  });

  // PILLOW-001 / PILLOW-002
  it.each([
    { direction: 'RIGHT' as const, dodge: 'DODGE_LEFT' as const },
    { direction: 'LEFT' as const, dodge: 'DODGE_RIGHT' as const },
  ])('$direction からの攻撃を $dodge で回避すると PERFECT DODGE になる', ({ direction, dodge }) => {
    const context = setup();
    let acceptance;
    startAndActAtHitOffset(context, direction, 0, () => {
      acceptance = context.controller.submitAction(dodge);
    });
    context.advance(100);

    expect(acceptance).toBe('ACCEPTED');
    expect(context.events).toContainEqual({ type: 'JUDGED', result: 'PERFECT_DODGE' });
    expect(context.machine.state).toBe('COUNTER_WINDOW');
    expect(context.vitals.sleepiness).toBe(0);
  });

  // PILLOW-003 / PILLOW-004
  it.each([
    { direction: 'RIGHT' as const, dodge: 'DODGE_RIGHT' as const },
    { direction: 'LEFT' as const, dodge: 'DODGE_LEFT' as const },
  ])('$direction からの攻撃を $dodge で受けると被弾する', ({ direction, dodge }) => {
    const context = setup();
    startAndActAtHitOffset(context, direction, 0, () => {
      context.controller.submitAction(dodge);
    });
    context.advance(100);

    expect(context.events).toContainEqual({ type: 'JUDGED', result: 'HIT' });
    expect(context.machine.state).toBe('HIT');
    expect(context.vitals.sleepiness).toBe(PILLOW_DAMAGE.sleepinessDamage);
  });

  // PILLOW-005 枕にガードは技選択ミスで被弾する。
  it('枕にガードを合わせると技選択ミスとして被弾する', () => {
    const context = setup();
    let acceptance;
    startAndActAtHitOffset(context, 'RIGHT', 0, () => {
      acceptance = context.controller.submitAction('GUARD');
    });
    context.advance(100);

    // 入力自体は受付ウィンドウ内なので受理され、正解行動でないことで失敗する。
    expect(acceptance).toBe('ACCEPTED');
    expect(context.events).toContainEqual({ type: 'JUDGED', result: 'HIT' });
    expect(context.machine.state).toBe('HIT');
    expect(context.vitals.sleepiness).toBe(PILLOW_DAMAGE.sleepinessDamage);
  });

  // PILLOW-006 t = -0.61 の正解方向回避は TOO EARLY で成功しない。
  it('受付開始より前 (着弾 -0.61秒) の正解方向回避は TOO EARLY で成功しない', () => {
    const context = setup();
    let acceptance;
    startAndActAtHitOffset(context, 'RIGHT', -610, () => {
      acceptance = context.controller.submitAction('DODGE_LEFT');
    });
    context.advance(610 + 100);

    expect(acceptance).toBe('TOO_EARLY');
    expect(context.events).toContainEqual({
      type: 'INPUT_REJECTED',
      action: 'DODGE_LEFT',
      reason: 'TOO_EARLY',
    });
    // 早押しは判定へ回らないため成功せず、反撃可能状態にもならない。
    expect(context.events).not.toContainEqual({ type: 'JUDGED', result: 'PERFECT_DODGE' });
    expect(context.machine.state).not.toBe('COUNTER_WINDOW');
  });

  // 受付幅 (着弾 -0.6秒 〜 +0.1秒) の両端とその外側。docs/testing-guide.md §9。
  // 受付開始の外側 (-601ms) は TOO EARLY で判定へ回らず形が違うため、
  // 上の PILLOW-006 に独立したケースとして置いている。
  // 受付内は反撃可能状態へ、受付終了より後は被弾する (INPUT-008)。
  // 早押しと違い判定へ回るので、結果は JUDGED として観測できる。
  it.each([
    { offsetMs: -600, expected: 'PERFECT_DODGE', state: 'COUNTER_WINDOW', sleepiness: 0 }, // 受付開始境界 (内側)
    { offsetMs: 0, expected: 'PERFECT_DODGE', state: 'COUNTER_WINDOW', sleepiness: 0 }, // 着弾ちょうど
    { offsetMs: 100, expected: 'PERFECT_DODGE', state: 'COUNTER_WINDOW', sleepiness: 0 }, // 受付終了境界 (内側)
    {
      offsetMs: 101,
      expected: 'MISS',
      state: 'HIT',
      sleepiness: PILLOW_DAMAGE.sleepinessDamage,
    }, // 受付終了境界の外側 → 遅すぎる
  ] as const)(
    '着弾 $offsetMs ms の正解方向回避は $expected になる',
    ({ offsetMs, expected, state, sleepiness }) => {
      const context = setup();
      startAndActAtHitOffset(context, 'LEFT', offsetMs, () => {
        context.controller.submitAction('DODGE_RIGHT');
      });
      context.advance(Math.max(0, -offsetMs) + 100);

      expect(context.events).toContainEqual({ type: 'JUDGED', result: expected });
      expect(context.machine.state).toBe(state);
      expect(context.vitals.sleepiness).toBe(sleepiness);
    },
  );

  // PILLOW-007 回避成功後に約1.5秒の反撃可能状態が発生する。
  it('回避成功後に約1.5秒の反撃可能状態が発生する', () => {
    const context = setup();
    const attack = startAndActAtHitOffset(context, 'RIGHT', 0, () => {
      context.controller.submitAction('DODGE_LEFT');
    });
    context.advance(100);

    expect(attack.counterWindowMs).toBe(1500);
    expect(context.machine.state).toBe('COUNTER_WINDOW');

    // 1.5秒の直前まではまだ反撃できる。
    context.advance(1499);
    expect(context.machine.state).toBe('COUNTER_WINDOW');

    // 1.5秒で Window が閉じ、反撃がないまま次のサイクルへ戻る。
    context.advance(1);
    expect(context.machine.state).toBe('IDLE');
    expect(context.vitals.bossHp).toBe(INITIAL_BOSS_HP);
  });

  // PILLOW-008 反撃可能時間内の攻撃で Boss HP が10減る。
  it('反撃可能時間内の攻撃で Boss HP が10減る', () => {
    const context = setup();
    startAndActAtHitOffset(context, 'RIGHT', 0, () => {
      context.controller.submitAction('DODGE_LEFT');
    });
    context.advance(100);
    const acceptance = context.controller.submitAction('ATTACK');

    expect(acceptance).toBe('ACCEPTED');
    expect(context.machine.state).toBe('DAMAGE');
    expect(PILLOW_DAMAGE.bossDamage).toBe(10);
    expect(context.vitals.bossHp).toBe(INITIAL_BOSS_HP - PILLOW_DAMAGE.bossDamage);
  });

  // PILLOW-009 反撃可能時間外の攻撃は WHIFF でダメージ0。
  it('反撃可能時間外の攻撃は WHIFF になり Boss HP が減らない', () => {
    const context = setup();
    startAndActAtHitOffset(context, 'RIGHT', 0);

    // 回避せず着弾させ、COUNTER_WINDOW が無いまま攻撃する。
    context.advance(100);
    const acceptance = context.controller.submitAction('ATTACK');

    expect(acceptance).toBe('WHIFF');
    expect(context.events).toContainEqual({
      type: 'INPUT_REJECTED',
      action: 'ATTACK',
      reason: 'WHIFF',
    });
    expect(context.vitals.bossHp).toBe(INITIAL_BOSS_HP);
  });

  // PILLOW-010 被弾時の SLEEPINESS 加算は1回だけ。
  it('被弾時に枕用の SLEEPINESS Damage が1回だけ加算される', () => {
    const context = setup();
    startAndActAtHitOffset(context, 'RIGHT', 0, () => {
      context.controller.submitAction('DODGE_RIGHT');
    });
    // 被弾から HIT を抜けて IDLE へ戻るまで進める。
    context.advance(100);
    context.advance(2000);

    const sleepinessChanges = context.events.filter((event) => event.type === 'SLEEPINESS_CHANGED');

    expect(context.machine.state).toBe('IDLE');
    expect(sleepinessChanges).toEqual([
      { type: 'SLEEPINESS_CHANGED', value: PILLOW_DAMAGE.sleepinessDamage },
    ]);
    expect(context.vitals.sleepiness).toBe(PILLOW_DAMAGE.sleepinessDamage);
  });

  // CUE-001 / CUE-002 情報提示を個別に OFF にしてもロジックは変わらない。
  it.each([
    {
      cue: 'visual' as const,
      suppressed: 'ATTACK_VISUAL_CUE' as const,
      remaining: 'ATTACK_AUDIO_CUE' as const,
    },
    {
      cue: 'audio' as const,
      suppressed: 'ATTACK_AUDIO_CUE' as const,
      remaining: 'ATTACK_VISUAL_CUE' as const,
    },
  ])(
    '$cue Cue を OFF にしても攻撃ロジックは正常で、もう一方の Cue は発生する',
    ({ cue, suppressed, remaining }) => {
      const context = setup();
      const attack = createPillowSweep({ direction: 'RIGHT', cues: { [cue]: false } });

      context.controller.start(attack);
      context.advance(hitAtFromStart(attack), () => {
        context.controller.submitAction('DODGE_LEFT');
      });
      context.advance(100);

      const types = context.events.map((event) => event.type);

      expect(types).not.toContain(suppressed);
      expect(types).toContain(remaining);
      // Cue を切っても着弾タイミングと判定は変わらない。
      expect(context.events).toContainEqual({ type: 'JUDGED', result: 'PERFECT_DODGE' });
      expect(context.machine.state).toBe('COUNTER_WINDOW');
    },
  );

  // CUE-005 / CUE-006 Cue は攻撃1回につき1度だけ発火し、HP を書き換えない。
  it('Visual / Audio Cue は攻撃1回につき1度だけ発火し、HP を書き換えない', () => {
    const context = setup();

    const attack = createPillowSweep({ direction: 'LEFT' });
    context.controller.start(attack);
    // TELEGRAPH の途中で何度 update しても Cue が増えないことを見る。
    context.advance(400);
    context.advance(400);
    context.advance(hitAtFromStart(attack) - 800);

    const visualCues = context.events.filter((event) => event.type === 'ATTACK_VISUAL_CUE');
    const audioCues = context.events.filter((event) => event.type === 'ATTACK_AUDIO_CUE');

    expect(visualCues).toEqual([
      {
        type: 'ATTACK_VISUAL_CUE',
        attackId: 'PILLOW_SWEEP',
        cue: 'pillow-sweep-telegraph-left',
      },
    ]);
    expect(audioCues).toEqual([
      { type: 'ATTACK_AUDIO_CUE', attackId: 'PILLOW_SWEEP', cue: 'pillow-sweep-wind-left' },
    ]);
    expect(context.vitals.bossHp).toBe(INITIAL_BOSS_HP);
    expect(context.vitals.sleepiness).toBe(0);
  });
});
