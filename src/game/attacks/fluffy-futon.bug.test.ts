import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import { createCombatStateMachine } from '../combat/state-machine';
import { createCombatVitals } from '../combat/vitals';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { createBossAttackController } from './boss-attack';
import {
  createFluffyFutonAttack,
  createFutonBlowAway,
  FUTON_BLOW_AWAY_CHANCE,
} from './fluffy-futon';

/** 構え + 溜め。ここを進めると ATTACK へ入る。 */
const TELEGRAPH_MS = 2300;
/** 叩きつけから着弾まで。ここまで進めた時刻が t = 0.0 (テスト仕様 §3.1)。 */
const HIT_AFTER_MS = 500;
/** 着弾から ATTACK 終了まで。回避受付の後ろ側 (+0.1秒) と同じ。 */
const HIT_TO_WINDOW_MS = 100;

/** LEFT を引く乱数 (テスト仕様 §3.2 FixedRandom)。 */
const PICK_LEFT = () => 0;

/** 必ず吹き飛ぶ / 決して吹き飛ばない抽選。確率そのものは別のテストで見る。 */
const ALWAYS_BLOW_AWAY = () => true;
const NEVER_BLOW_AWAY = () => false;

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

  const advance = (ms: number) => {
    clock.advance(ms);
    controller.update();
    machine.update();
  };

  advance(0);

  return { advance, controller, events, machine, vitals };
}

/** 回避せずに着弾させ、被弾の結果が出るところまで進める。 */
function takeTheHit(advance: (ms: number) => void) {
  advance(TELEGRAPH_MS);
  advance(HIT_AFTER_MS);
  advance(HIT_TO_WINDOW_MS);
}

/**
 * Intentional Bug: ふかふか布団に入らず、たまに吹き飛ぶ
 *
 * ファイナルソード的なB級3DアクションRPGの「物理演算事故のように見える倒れ方」
 * へのオマージュとして意図的に実装している
 * (Issue #140 / Issue #42「入れてよい『バグ風』表現」)。
 * 通常の不具合として修正しないこと。
 *
 * 本来の期待動作: 回避に失敗したら必ず布団に入り、SLEEPINESS が増える。
 * 現在の挙動: 4回に1回、布団が空振ったようにプレイヤーだけが吹き飛び、
 * その周回の SLEEPINESS が増えない。
 *
 * #42 の「入れてはいけない本物のバグ」を踏まないための線引き:
 *
 * - 抽選は布団を出した時点で1回だけ引き、着弾の瞬間には引き直さない。
 *   同じ一手の中で結果が揺れるとマルチプレイの同期が壊れる。
 * - HIT State へは通常どおり進むので、攻撃サイクルも出題順も飛ばない。
 *   進行不能にはならない。
 * - SLEEPINESS が増えないのはプレイヤーに有利な方向なので、
 *   吹き飛びが連続しても詰みが発生しない。
 * - ゲームロジック側の既定は「抽選しない」。本番の抽選は合成点 (`App.tsx`)
 *   が `createFutonBlowAway()` を渡して入れる。
 */
describe('Intentional Bug: 布団に入らず吹き飛ぶ', () => {
  it('吹き飛んだ周回は SLEEPINESS が増えない', () => {
    const { advance, controller, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_LEFT, blowAway: ALWAYS_BLOW_AWAY }));
    takeTheHit(advance);

    expect(vitals.sleepiness).toBe(0);
  });

  it('吹き飛んでも被弾そのものは起き、攻撃サイクルは止まらない', () => {
    const { advance, controller, events, machine } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_LEFT, blowAway: ALWAYS_BLOW_AWAY }));
    takeTheHit(advance);

    // 進行不能にしないため、State は通常の被弾と同じ HIT へ進む。
    expect(machine.state).toBe('HIT');
    expect(events).toContainEqual({ type: 'PLAYER_BLOWN_AWAY', attackId: 'FLUFFY_FUTON' });
  });

  it('吹き飛ばなかった周回は通常どおり SLEEPINESS が増える', () => {
    const { advance, controller, events, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_LEFT, blowAway: NEVER_BLOW_AWAY }));
    takeTheHit(advance);

    expect(vitals.sleepiness).toBe(28);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'PLAYER_BLOWN_AWAY' }));
  });

  it('抽選しない設定を既定にしているので、指定しなければ吹き飛ばない', () => {
    const { advance, controller, vitals } = setup();

    controller.start(createFluffyFutonAttack({ random: PICK_LEFT }));
    takeTheHit(advance);

    expect(vitals.sleepiness).toBe(28);
  });

  it('抽選は4回に1回。境界のちょうど0.25は吹き飛ばない', () => {
    expect(FUTON_BLOW_AWAY_CHANCE).toBe(0.25);
    expect(createFutonBlowAway(() => 0)()).toBe(true);
    expect(createFutonBlowAway(() => 0.2499)()).toBe(true);
    expect(createFutonBlowAway(() => FUTON_BLOW_AWAY_CHANCE)()).toBe(false);
    expect(createFutonBlowAway(() => 0.99)()).toBe(false);
  });
});
