import { beforeEach, describe, expect, it } from 'vitest';

import { createFakeClock } from '@/game/clock';
import type { GameEvent } from '@/game/events/game-event';
import type { PlayerAction } from '@/game/types';
import { INITIAL_BOSS_HP, MAX_SLEEPINESS } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { createCombatSession, type FrameLoop } from './combat-session';

/**
 * フレームを手で進められるループ。rAF も実時間も使わずに
 * 「何フレーム進んだか」だけを操作する。
 */
function createManualLoop(): { loop: FrameLoop; tick: () => void; isStopped: () => boolean } {
  let onFrame: (() => void) | null = null;
  let stopped = false;

  return {
    loop: (frame) => {
      onFrame = frame;
      return () => {
        stopped = true;
        onFrame = null;
      };
    },
    tick: () => onFrame?.(),
    isStopped: () => stopped,
  };
}

function setup() {
  const clock = createFakeClock();
  const { loop, tick, isStopped } = createManualLoop();
  const session = createCombatSession({ clock, frameLoop: loop, random: () => 0 });

  const events: GameEvent[] = [];
  session.eventBus.subscribe((event) => events.push(event));

  const advance = (ms: number) => {
    clock.advance(ms);
    tick();
  };

  return { advance, clock, events, isStopped, session, tick };
}

describe('createCombatSession', () => {
  beforeEach(() => {
    useGameStore.setState({
      combatState: 'INTRO',
      bossHp: INITIAL_BOSS_HP,
      bossHpMax: INITIAL_BOSS_HP,
      sleepiness: 0,
      sleepinessMax: MAX_SLEEPINESS,
      lastAttackId: null,
      sequencePhase: 'TUTORIAL',
      assistVisible: false,
      eventFeedback: null,
    });
  });

  it('戦闘を進めるとHUDの表示状態が実際の戦闘イベントで変わる', () => {
    const { advance, tick } = setup();

    // INTRO (既定3秒) を抜けて最初の技が始まるまで進める。
    tick();
    advance(3_100);

    expect(useGameStore.getState().combatState).not.toBe('INTRO');

    // 防御入力を出さずに回すと被弾し、眠気が上がる。
    const feedbackSeen: unknown[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      advance(200);
      const { eventFeedback } = useGameStore.getState();
      if (eventFeedback !== null) feedbackSeen.push(eventFeedback);
    }

    expect(useGameStore.getState().sleepiness).toBeGreaterThan(0);
    // 入力が無いまま着弾した周回でも、被弾が表示イベントとして出る。
    expect(feedbackSeen).toContainEqual({
      kind: 'RESULT',
      result: 'HIT',
      attackId: 'PILLOW_SWEEP',
    });
  });

  it('戦闘の上限値をHUDのゲージの分母へ渡す', () => {
    setup();

    expect(useGameStore.getState()).toMatchObject({
      bossHpMax: INITIAL_BOSS_HP,
      sleepinessMax: MAX_SLEEPINESS,
    });
  });

  it('破棄するとループを止め、以降のイベントをHUDへ流さない', () => {
    const { advance, isStopped, session, tick } = setup();

    tick();
    advance(3_100);
    session.dispose();

    const stateAfterDispose = useGameStore.getState().combatState;
    session.eventBus.emit({ type: 'BOSS_HP_CHANGED', hp: 1 });

    expect(isStopped()).toBe(true);
    expect(useGameStore.getState().bossHp).not.toBe(1);
    expect(useGameStore.getState().combatState).toBe(stateAfterDispose);
  });

  it('チュートリアルの1手目から補助表示を出し、本戦では出さない', () => {
    // SEQ-003 / SEQ-004。1手だけのチュートリアルと本戦で切り替わりを見る。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      tutorialSequence: [{ slot: 'PILLOW_SWEEP', phase: 'TUTORIAL', assist: true }],
      mainSequence: [{ slot: 'YAWN_WAVE', phase: 'MAIN', assist: false }],
    });

    const advance = (ms: number) => {
      clock.advance(ms);
      tick();
    };

    tick();
    advance(3_100);

    expect(useGameStore.getState()).toMatchObject({
      sequencePhase: 'TUTORIAL',
      assistVisible: true,
    });

    // 入力せず被弾して1サイクルを終え、本戦の手へ進める。
    for (let frame = 0; frame < 40; frame += 1) {
      advance(200);
      if (useGameStore.getState().sequencePhase === 'MAIN') break;
    }

    expect(useGameStore.getState()).toMatchObject({ sequencePhase: 'MAIN', assistVisible: false });
  });

  it('本戦の攻撃順を設定から差し替えられる', () => {
    // 完了条件「本戦の攻撃順を設定から調整できる」。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      tutorialSequence: [],
      mainSequence: [{ slot: 'FLUFFY_FUTON', phase: 'MAIN', assist: false }],
    });

    const started: string[] = [];
    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_STARTED') started.push(event.attackId);
    });

    tick();
    clock.advance(3_100);
    tick();

    expect(started).toEqual(['FLUFFY_FUTON']);
  });

  it('正しく応じ続けると最終ふかふか布団まで1戦を通して進行できる', () => {
    // 完了条件「最終ふかふか布団まで1戦を通して進行できる」。
    // 予兆で出る Visual Cue から正解の防御を選び、成功したら反撃する。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({ clock, frameLoop: loop, random: () => 0 });

    const startedAttacks: string[] = [];
    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'SEQUENCE_STEP_STARTED') startedAttacks.push(event.attackId);

      // 正解は Cue から読む。方向は Cue ID に埋まっている。
      if (event.type === 'ATTACK_VISUAL_CUE') {
        if (event.cue.includes('left')) pendingDefense = 'DODGE_RIGHT';
        else if (event.cue.includes('right')) pendingDefense = 'DODGE_LEFT';
        else pendingDefense = 'GUARD';
      }

      if (event.type === 'JUDGED') {
        shouldCounter = event.result === 'PERFECT_DODGE' || event.result === 'JUST_GUARD';
      }
    });

    tick();

    for (let frame = 0; frame < 4_000; frame += 1) {
      clock.advance(50);
      tick();

      const { combatState } = useGameStore.getState();

      // 着弾直前の受付内に防御を出す。
      if (combatState === 'ATTACK' && pendingDefense !== null) {
        session.submitAction(pendingDefense);
        pendingDefense = null;
      }

      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
      }

      if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') break;
    }

    // チュートリアル5手を抜けて本戦へ入り、最終ふかふか布団まで到達する。
    expect(startedAttacks.slice(0, 5)).toEqual([
      'PILLOW_SWEEP',
      'PILLOW_SWEEP',
      'YAWN_WAVE',
      'YAWN_WAVE',
      'FLUFFY_FUTON',
    ]);
    expect(startedAttacks).toContain('FLUFFY_FUTON');
    expect(useGameStore.getState().combatState).toBe('BOSS_DEFEATED');
  });
});
