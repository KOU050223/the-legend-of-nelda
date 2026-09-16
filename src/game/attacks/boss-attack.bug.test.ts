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

  return { advance, controller, events, machine, vitals };
}

/**
 * Intentional Bug: 早押しした防御入力は、画面上は何も起きないまま被弾する
 *
 * ファイナルソード的なB級3DアクションRPGの「入力が飲まれたように見える」
 * 手触りへのオマージュとして意図的に残している
 * (Issue #140 / Issue #42「これバグでは？と思わせる挙動」)。
 * 通常の不具合として修正しないこと。
 *
 * 本来の期待動作: 早すぎる入力にも「早かった」と分かる判定表示が出るか、
 * せめて受付ウィンドウへ入り直せば回避できる。
 * 現在の挙動: 受付ウィンドウより前の入力は `JUDGED` を発行せずに捨てられ、
 * さらに 400ms の硬直が乗る。硬直が明ける前に受付ウィンドウへ入ってしまうと
 * 入力そのものが `LOCKED` になり、プレイヤーから見ると
 * 「ボタンを押したのに何の反応もないまま殴られた」ように見える。
 *
 * Game Logic は壊れていない。眠気ダメージは仕様どおり入り、次の周回では
 * 通常どおり回避できる (#42「入れてはいけない本物のバグ」の操作不能には
 * 当たらない)。壊れて見えるのは判定表示と入力受付の見た目だけ。
 */
describe('Intentional Bug: 早押しは無反応のまま被弾する', () => {
  it('受付ウィンドウより前の入力は判定を出さずに捨てられ、そのまま被弾する', () => {
    const { advance, controller, events, machine } = setup();

    controller.start(dummyAttack);
    // TELEGRAPH 中。着弾予定はまだ 2400ms 先で、受付開始 (着弾-600ms) より前。
    advance(1000);
    const tooEarly = controller.submitAction('DODGE_LEFT');

    expect(tooEarly).toBe('TOO_EARLY');
    expect(events).toContainEqual({
      type: 'INPUT_REJECTED',
      action: 'DODGE_LEFT',
      reason: 'TOO_EARLY',
    });
    // 早押しは JUDGED を出さない。プレイヤーには成否が一切表示されない。
    expect(events.filter((event) => event.type === 'JUDGED')).toEqual([]);

    advance(1000);
    advance(500);

    expect(machine.state).toBe('HIT');
  });

  it('早押しの硬直中は受付ウィンドウへ入り直しても回避できず、必ず被弾する', () => {
    const { advance, controller, machine } = setup();

    controller.start(dummyAttack);
    advance(1000);
    controller.submitAction('DODGE_LEFT');

    // 硬直 400ms より手前で受付ウィンドウへ入る時刻を選ぶ。
    advance(300);
    const duringLock = controller.submitAction('DODGE_LEFT');

    expect(duringLock).toBe('LOCKED');

    advance(700);
    advance(500);

    expect(machine.state).toBe('HIT');
  });
});
