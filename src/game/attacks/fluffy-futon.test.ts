import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { createCombatStateMachine } from '../combat/state-machine';
import { createCombatVitals } from '../combat/vitals';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { createBossAttackController } from './boss-attack';
import { createFluffyFutonAttack } from './fluffy-futon';

/** 構え + 溜め。ここを進めると ATTACK へ入る。 */
const TELEGRAPH_MS = 2300;
/** 叩きつけから着弾まで。ここまで進めた時刻が t = 0.0 (テスト仕様 §3.1)。 */
const HIT_AFTER_MS = 500;
/** 着弾から ATTACK 終了まで。回避受付の後ろ側 (+0.1秒) と同じ。 */
const HIT_TO_WINDOW_MS = 100;

/** LEFT を引く乱数と RIGHT を引く乱数 (テスト仕様 §3.2 FixedRandom)。 */
const PICK_LEFT = () => 0;
const PICK_RIGHT = () => 0.99;

function setup() {
  const clock = createFakeClock();
  const eventBus = createGameEventBus();
  const events: GameEvent[] = [];
  eventBus.subscribe((event) => events.push(event));
  const vitals = createCombatVitals({ eventBus });
  let controller: ReturnType<typeof createBossAttackController>;
  const machine = createCombatStateMachine({
    clock,
    timings: { INTRO: 0 },
    resolveJudgement: (attack) => controller.resolveJudgement(attack),
    resolveBattleEnd: vitals.resolveBattleEnd,
  });
  controller = createBossAttackController({ clock, machine, vitals, eventBus });

  /** 時計を進めてから update する。攻撃入力の前に必ず State を最新にする。 */
  const advance = (ms: number) => {
    clock.advance(ms);
    controller.update();
    machine.update();
  };

  advance(0);

  const transitions: string[] = [];
  machine.onTransition(({ to }) => transitions.push(to));

  return { advance, controller, events, machine, transitions, vitals };
}

/** 着弾時刻 (t = 0.0) まで進める。 */
function advanceToHit(advance: (ms: number) => void) {
  advance(TELEGRAPH_MS);
  advance(HIT_AFTER_MS);
}

/** 着弾時刻ちょうどで回避し、COUNTER_WINDOW の開始まで進める。 */
function dodgeThenOpenWindow(
  advance: (ms: number) => void,
  controller: ReturnType<typeof createBossAttackController>,
  action: 'DODGE_LEFT' | 'DODGE_RIGHT',
) {
  advanceToHit(advance);
  const acceptance = controller.submitAction(action);
  advance(HIT_TO_WINDOW_MS);

  return acceptance;
}

describe('究極奥義・ふかふか布団', () => {
  // FUTON-001 / FUTON-002
  it.each([
    { random: PICK_RIGHT, direction: 'RIGHT', dodge: 'DODGE_LEFT' as const },
    { random: PICK_LEFT, direction: 'LEFT', dodge: 'DODGE_RIGHT' as const },
  ])('$direction の布団は反対側への回避で第1段階を成功する', ({ random, direction, dodge }) => {
    const { advance, controller, machine } = setup();
    const futon = createFluffyFutonAttack({ random });

    expect(futon.direction).toBe(direction);
    expect(futon.correctAction).toBe(dodge);

    controller.start(futon);
    const acceptance = dodgeThenOpenWindow(advance, controller, dodge);

    expect(acceptance).toBe('ACCEPTED');
    // 第2段階 = COUNTER_WINDOW。回避成功がそのままカウンター受付へ繋がる。
    expect(machine.state).toBe('COUNTER_WINDOW');
  });

  // FUTON-003
  it('同じ方向へ回避すると被弾する', () => {
    const { advance, controller, events, machine, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_RIGHT');

    expect(machine.state).toBe('HIT');
    expect(events).toContainEqual({ type: 'JUDGED', result: 'HIT' });
    expect(vitals.sleepiness).toBe(28);
    // 逆方向へ回避した場合も、入力なしの被弾 (FUTON-009) と同じく1回だけ加算する。
    expect(events.filter((event) => event.type === 'SLEEPINESS_CHANGED')).toEqual([
      { type: 'SLEEPINESS_CHANGED', value: 28 },
    ]);
  });

  // FUTON-004 / FUTON-005
  // 境界の起点は COUNTER_WINDOW の開始であって回避入力の時刻ではない。
  // 窓は常に着弾時刻 + acceptToMs に開くため、回避を受付の早い側で通したか
  // 遅い側で通したかによって入力時刻からの長さは変わってしまう。
  it.each([
    { label: '0.80秒', elapsedMs: 800, acceptance: 'ACCEPTED', state: 'DAMAGE', bossHp: 70 },
    { label: '0.81秒', elapsedMs: 801, acceptance: 'WHIFF', state: 'IDLE', bossHp: 100 },
  ])('回避成功後$labelの攻撃は $acceptance になる', ({ elapsedMs, acceptance, state, bossHp }) => {
    const { advance, controller, machine, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(elapsedMs);

    expect(controller.submitAction('ATTACK')).toBe(acceptance);
    expect(machine.state).toBe(state);
    expect(vitals.bossHp).toBe(bossHp);
  });

  // FUTON-005 の帰結。窓が切れたあとは DAMAGE を経由せずサイクルが閉じる。
  it('カウンターが遅れた場合も大ダウンは発生しない', () => {
    const { advance, controller, transitions, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(801);
    controller.submitAction('ATTACK');

    expect(transitions).not.toContain('DAMAGE');
    expect(vitals.bossHp).toBe(100);
  });

  // FUTON-006
  it('回避成功のまま攻撃しなければ、被弾も大ダウンもなく次の攻撃へ進む', () => {
    const { advance, controller, machine, transitions, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_LEFT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_RIGHT');
    advance(801);

    expect(transitions).not.toContain('HIT');
    expect(transitions).not.toContain('DAMAGE');
    expect(vitals.sleepiness).toBe(0);
    expect(vitals.bossHp).toBe(100);
    // 次の攻撃を開始できる状態まで戻っている。
    expect(machine.state).toBe('IDLE');
    expect(controller.start(createFluffyFutonAttack({ random: PICK_LEFT }))).toBe(true);
  });

  // FUTON-007
  it('カウンター成功でBoss HPを30減らす', () => {
    const { advance, controller, events, machine, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(300);
    controller.submitAction('ATTACK');

    expect(machine.state).toBe('DAMAGE');
    expect(vitals.bossHp).toBe(70);
    expect(events.filter((event) => event.type === 'BOSS_HP_CHANGED')).toEqual([
      { type: 'BOSS_HP_CHANGED', hp: 70 },
    ]);
  });

  // FUTON-008
  // 仕様 §11 の「約2.5〜3秒」は大ダウンの演出尺として DAMAGE の滞在時間に写す。
  // FUTON-007 が Boss HP -30 を単発の確定値として規定し、FUTON-010 が連打による
  // 多重発生を禁じているため、この間は追撃可能な窓ではない。
  it('カウンター成功後の大ダウンが約2.8秒続き、その間は追撃できない', () => {
    const { advance, controller, machine } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(300);
    controller.submitAction('ATTACK');

    advance(2799);
    expect(machine.state).toBe('DAMAGE');
    // 大ダウン中の追撃は成立しない。反撃は COUNTER_WINDOW だけで受ける。
    expect(controller.registerCounter()).toBe(false);

    advance(1);
    expect(machine.state).toBe('IDLE');
  });

  // FUTON-009
  it('回避失敗で大きなSLEEPINESS Damageを1回だけ加算する', () => {
    const { advance, controller, events, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_LEFT }));
    advanceToHit(advance);
    // 回避せずに着弾させる。
    advance(HIT_TO_WINDOW_MS);

    expect(vitals.sleepiness).toBe(28);
    expect(events.filter((event) => event.type === 'SLEEPINESS_CHANGED')).toEqual([
      { type: 'SLEEPINESS_CHANGED', value: 28 },
    ]);
  });

  // FUTON-010 / CUE-006
  it('カウンター成功後に連打してもDamageとCounter Eventが複数回発生しない', () => {
    const { advance, controller, events, transitions, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(300);

    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    // 成立直後の連打。入力ゲートの再入力ロックと、COUNTER_WINDOW 以外では
    // false を返す registerCounter() の 二重で止まる。
    expect(controller.submitAction('ATTACK')).not.toBe('ACCEPTED');
    expect(controller.registerCounter()).toBe(false);
    advance(500);
    expect(controller.submitAction('ATTACK')).not.toBe('ACCEPTED');

    expect(transitions.filter((state) => state === 'DAMAGE')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'BOSS_HP_CHANGED')).toHaveLength(1);
    expect(vitals.bossHp).toBe(70);
    // Cue も1攻撃につき1回だけ。
    expect(events.filter((event) => event.type === 'ATTACK_VISUAL_CUE')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'ATTACK_AUDIO_CUE')).toHaveLength(1);
  });

  // 回避受理後の再入力ロック (defenseMs 0.7秒) がカウンターを塞がないこと。
  // 防御と攻撃でロックを分けている理由そのもの (player-input.ts のコメント)。
  it('回避受理直後でもカウンター入力は塞がれない', () => {
    const { advance, controller, machine } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');

    // 回避から 100ms しか経っておらず、防御の再入力ロックはまだ明けていない。
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    expect(machine.state).toBe('DAMAGE');
  });
});
