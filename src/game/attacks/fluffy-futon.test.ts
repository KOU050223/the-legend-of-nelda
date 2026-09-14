import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { createCombatStateMachine } from '../combat/state-machine';
import { createCombatVitals } from '../combat/vitals';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { createBossAttackController, type BossAttack } from './boss-attack';
import { createFluffyFutonAttack } from './fluffy-futon';

/**
 * 大ダウン中の追撃に単価を持たせた定義。
 *
 * 既定の BOSS_DOWN_FOLLOW_UP_DAMAGE は 0 で、仕様 §17 の攻撃順に
 * 追撃の入る余地が無いため (combat-balance.ts の算術)。ここで検証したいのは
 * 「大ダウン中に追撃が通り、1発ごとにダメージが入る」という機構そのものなので、
 * 単価を明示して回す。
 */
function withFollowUpDamage(attack: BossAttack, damage = 10): BossAttack {
  return { ...attack, bossDownFollowUpDamage: damage };
}

/** 構え + 溜め。ここを進めると ATTACK へ入る。 */
const TELEGRAPH_MS = 2300;
/** 叩きつけから着弾まで。ここまで進めた時刻が t = 0.0 (テスト仕様 §3.1)。 */
const HIT_AFTER_MS = 500;
/** 着弾から ATTACK 終了まで。回避受付の後ろ側 (+0.1秒) と同じ。 */
const HIT_TO_WINDOW_MS = 100;

/** LEFT を引く乱数と RIGHT を引く乱数 (テスト仕様 §3.2 FixedRandom)。 */
const PICK_LEFT = () => 0;
const PICK_RIGHT = () => 0.99;

function setup(vitalsOptions: Parameters<typeof createCombatVitals>[0] = {}) {
  const clock = createFakeClock();
  const eventBus = createGameEventBus();
  const events: GameEvent[] = [];
  eventBus.subscribe((event) => events.push(event));
  const vitals = createCombatVitals({ ...vitalsOptions, eventBus });
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

  return { advance, clock, controller, events, machine, transitions, vitals };
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
    {
      random: PICK_RIGHT,
      direction: 'RIGHT',
      dodge: 'DODGE_LEFT' as const,
      cue: 'futon-summon-right',
    },
    {
      random: PICK_LEFT,
      direction: 'LEFT',
      dodge: 'DODGE_RIGHT' as const,
      cue: 'futon-summon-left',
    },
  ])(
    '$direction の布団は反対側への回避で第1段階を成功する',
    ({ random, direction, dodge, cue }) => {
      const { advance, controller, events, machine } = setup();
      const futon = createFluffyFutonAttack({ random });

      expect(futon.direction).toBe(direction);
      expect(futon.correctAction).toBe(dodge);

      controller.start(futon);
      const acceptance = dodgeThenOpenWindow(advance, controller, dodge);

      expect(acceptance).toBe('ACCEPTED');
      // 第2段階 = COUNTER_WINDOW。回避成功がそのままカウンター受付へ繋がる。
      expect(machine.state).toBe('COUNTER_WINDOW');
      // Visual Cue に構えた向きが乗る。Rendering 側が左右を描き分けられないと
      // プレイヤーが回避方向を判断できない (§10)。ATTACK 開始時に同じ Cue が
      // ACTIVATION として再送されるので (vfx-cue.ts のレビュー指摘)、2件届く。
      // durationMs は予兆の尺として共通基盤が添えるため内容を固定しない。
      expect(events.filter((event) => event.type === 'ATTACK_VISUAL_CUE')).toMatchObject([
        { type: 'ATTACK_VISUAL_CUE', attackId: 'FLUFFY_FUTON', cue },
        { type: 'ATTACK_VISUAL_CUE', attackId: 'FLUFFY_FUTON', cue, phase: 'ACTIVATION' },
      ]);
      // 聴覚の予兆は左右を区別しない。
      expect(events.filter((event) => event.type === 'ATTACK_AUDIO_CUE')).toMatchObject([
        { type: 'ATTACK_AUDIO_CUE', attackId: 'FLUFFY_FUTON', cue: 'futon-jingle' },
      ]);
    },
  );

  // FUTON-001 / FUTON-002 の受付幅の端。成功幅を受付幅と同じに採っているため、
  // 受理される範囲 (-0.6秒 〜 +0.1秒) のどこで回避しても第1段階は成功する。
  //
  // 受付終了 (+0.10秒) ちょうどは、その時刻に ATTACK の滞在も終わるため
  // 同じ tick で JUDGE へ抜けてしまい、この Fake Clock の粒度では入力を
  // 差し込めない。実機のフレーム間隔では起こり得る入力なので、
  // ここでは受付開始側と中間だけを見る。
  it.each([
    { label: '-0.60秒', offsetMs: -600 },
    { label: '-0.30秒', offsetMs: -300 },
    { label: '-0.10秒', offsetMs: -100 },
  ])('受付幅の端 ($label) で回避しても第1段階を成功する', ({ offsetMs }) => {
    const { advance, controller, machine, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    advance(TELEGRAPH_MS);
    advance(HIT_AFTER_MS + offsetMs);

    expect(controller.submitAction('DODGE_LEFT')).toBe('ACCEPTED');

    // 着弾と ATTACK 終了まで進めて判定させる。
    advance(-offsetMs + HIT_TO_WINDOW_MS);

    expect(machine.state).toBe('COUNTER_WINDOW');
    expect(vitals.sleepiness).toBe(0);
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
  //
  // 境界の起点は「回避が受理された時刻」。受付幅のどこで回避が通ったかに
  // よらず 0.8秒でなければならないため、回避 offset を変えても同じ境界に
  // なることまで見る。起点を COUNTER_WINDOW の開始 (着弾 + 受付後端) に
  // 取ると、-0.6秒で回避した場合に反撃可能時間が 1.5秒へ伸びてしまう。
  it.each([
    { label: '0.80秒', afterDodgeMs: 800, acceptance: 'ACCEPTED', bossHp: 70 },
    { label: '0.81秒', afterDodgeMs: 801, acceptance: 'WHIFF', bossHp: 100 },
  ])('回避成功後 $label の攻撃は $acceptance になる', ({ afterDodgeMs, acceptance, bossHp }) => {
    for (const dodgeOffsetMs of [0, -300, -600]) {
      const { advance, controller, vitals } = setup();

      controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
      advance(TELEGRAPH_MS);
      advance(HIT_AFTER_MS + dodgeOffsetMs);
      expect(controller.submitAction('DODGE_LEFT')).toBe('ACCEPTED');

      // 回避からちょうど afterDodgeMs 経過した時点まで進める。
      advance(afterDodgeMs);

      expect(controller.submitAction('ATTACK')).toBe(acceptance);
      expect(vitals.bossHp).toBe(bossHp);
    }
  });

  it('受付開始時の回避から0.5秒後でもカウンターできる', () => {
    const { advance, controller, machine, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    // 着弾の0.6秒前は TELEGRAPH 中。時計を巻き戻さずにそこまで進める。
    advance(TELEGRAPH_MS + HIT_AFTER_MS - 600);

    expect(controller.submitAction('DODGE_LEFT')).toBe('ACCEPTED');
    expect(machine.state).toBe('COUNTER_WINDOW');

    advance(500);
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    expect(vitals.bossHp).toBe(70);
  });

  it('最初に受理した回避を受付終了時点の再入力で上書きしない', () => {
    const { clock, controller } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    clock.advance(TELEGRAPH_MS + HIT_AFTER_MS - 600);
    expect(controller.submitAction('DODGE_LEFT')).toBe('ACCEPTED');

    // 最初の回避から0.7秒後（受付終了 +0.1秒）に、update 前で別方向を押す。
    clock.advance(700);
    expect(controller.submitAction('DODGE_RIGHT')).toBe('LOCKED');
  });

  // FUTON-005 の帰結。窓が切れたあとは DAMAGE を経由せずサイクルが閉じる。
  it('カウンターが遅れた場合も大ダウンは発生しない', () => {
    const { advance, controller, transitions, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(801);
    controller.submitAction('ATTACK');

    expect(transitions).not.toContain('DAMAGE');
    expect(transitions).not.toContain('BOSS_DOWN');
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
    expect(transitions).not.toContain('BOSS_DOWN');
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

  it('カウンターでBoss HPが0になれば大ダウンへ入らず即座に勝利する', () => {
    const { advance, controller, machine } = setup({ initialBossHp: 30 });

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');

    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    expect(machine.state).toBe('BOSS_DEFEATED');
  });

  it('ダメージ上書きをカウンターと被弾の両方へ適用する', () => {
    const { advance, controller, vitals } = setup({
      attackDamage: { FLUFFY_FUTON: { bossDamage: 20, sleepinessDamage: 50 } },
    });

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    expect(vitals.bossHp).toBe(80);

    advance(400);
    advance(2800);
    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_RIGHT');
    expect(vitals.sleepiness).toBe(50);
  });

  // FUTON-008
  // 仕様 §11 の「約2.5〜3秒反撃可能」。カウンター成立の DAMAGE (§15 の約0.4秒) を
  // 抜けたあとに BOSS_DOWN が続き、その間プレイヤーは追撃できる。
  it('カウンター成功後に大ダウンが発生し、その間は追撃できる', () => {
    const { advance, controller, machine, vitals, events } = setup();

    controller.start(withFollowUpDamage(createFluffyFutonAttack({ random: PICK_RIGHT })));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(300);
    controller.submitAction('ATTACK');

    // カウンター成立の State。§15 の約0.4秒を守る。
    expect(machine.state).toBe('DAMAGE');
    expect(vitals.bossHp).toBe(70);

    advance(400);
    expect(machine.state).toBe('BOSS_DOWN');

    // 大ダウン中は追撃できる。1発ごとに追撃ダメージが入る。
    // 間隔は再入力ロック (counterMs) 以上を空ける。連打しても
    // ロックのぶんしか通らないのが仕様 §13「最初の入力のみ採用」。
    advance(700);
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    expect(vitals.bossHp).toBe(60);

    // State は BOSS_DOWN のまま進まないため、追撃のヒットは
    // COMBAT_STATE_CHANGED ではなく専用イベントで Audio / VFX へ届く
    // (このイベントが無いと、HPが削れているのにヒット音もシェイクも出ない)。
    expect(events.filter((e) => e.type === 'BOSS_DOWN_FOLLOW_UP_HIT')).toHaveLength(1);

    advance(700);
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    expect(vitals.bossHp).toBe(50);
    expect(events.filter((e) => e.type === 'BOSS_DOWN_FOLLOW_UP_HIT')).toHaveLength(2);

    // 2.8秒の直前まで大ダウンが続く。
    advance(2800 - 1400 - 1);
    expect(machine.state).toBe('BOSS_DOWN');

    advance(1);
    expect(machine.state).toBe('IDLE');
  });

  it('update が遅れても大ダウン期限後の追撃を受理しない', () => {
    const { advance, clock, controller, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    advance(400);

    // 次の update より先に非同期入力が到着した場合でも期限を超えていれば失敗する。
    clock.advance(2800);
    expect(controller.submitAction('ATTACK')).toBe('WHIFF');
    expect(vitals.bossHp).toBe(70);
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
  //
  // 禁じられているのは「1回のカウンター入力で Damage / Counter Event が
  // 複数回出ること」。大ダウン中の追撃は別入力による別のダメージなので、
  // ここでは成立したカウンターが1度きりであることを見る。
  it('1回のカウンター入力でDamageとCounter Eventが複数回発生しない', () => {
    const { advance, controller, events, transitions, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_RIGHT }));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(300);

    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    // 成立直後の連打。入力ゲートの再入力ロックと、COUNTER_WINDOW 以外では
    // false を返す registerCounter() の二重で止まる。
    expect(controller.submitAction('ATTACK')).not.toBe('ACCEPTED');
    expect(controller.registerCounter()).toBe(false);

    // DAMAGE を抜けきるまでは追撃も入らない。
    advance(399);
    expect(controller.submitAction('ATTACK')).not.toBe('ACCEPTED');

    expect(transitions.filter((state) => state === 'DAMAGE')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'BOSS_HP_CHANGED')).toHaveLength(1);
    expect(vitals.bossHp).toBe(70);
    // Cue は連打では増えない。Visual は TELEGRAPH の予兆 + ATTACK の
    // ACTIVATION 再送で2件 (vfx-cue.ts のレビュー指摘)、Audio は予兆の1件のみ。
    expect(events.filter((event) => event.type === 'ATTACK_VISUAL_CUE')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'ATTACK_AUDIO_CUE')).toHaveLength(1);
  });

  // 大ダウン中の追撃も連打では通らない。入力ゲートの再入力ロックが効く。
  it('大ダウン中の追撃は連打してもロック中は通らない', () => {
    const { advance, controller, events, vitals } = setup();

    controller.start(withFollowUpDamage(createFluffyFutonAttack({ random: PICK_RIGHT })));
    dodgeThenOpenWindow(advance, controller, 'DODGE_LEFT');
    advance(300);
    controller.submitAction('ATTACK');
    advance(400);

    advance(500);
    expect(controller.submitAction('ATTACK')).toBe('ACCEPTED');
    // 直後の連打はロックで弾かれ、追撃ダメージは二重に入らない。
    expect(controller.submitAction('ATTACK')).not.toBe('ACCEPTED');
    expect(vitals.bossHp).toBe(60);

    // カウンター成立の30と追撃の10で、HP変化は2回だけ。
    expect(events.filter((event) => event.type === 'BOSS_HP_CHANGED')).toHaveLength(2);
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
