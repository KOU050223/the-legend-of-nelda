import { beforeEach, describe, expect, it } from 'vitest';

import { createFakeClock } from '@/game/clock';
import type { GameEvent } from '@/game/events/game-event';
import type { PlayerAction } from '@/game/types';
import {
  DEFAULT_ATTACK_DAMAGE,
  INITIAL_BOSS_HP,
  MAX_SLEEPINESS,
} from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { createAttackSequence } from '@/game/sequence/attack-sequence';

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
      tutorialSequence: [{ slot: 'PILLOW_SWEEP', assist: true }],
      mainSequence: [{ slot: 'YAWN_WAVE', assist: false }],
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
      mainSequence: [{ slot: 'FLUFFY_FUTON', assist: false }],
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

  it('正しく応じ続けると最終ふかふか布団のカウンターで決着する', () => {
    // 完了条件「最終ふかふか布団まで1戦を通して進行できる」。
    // チュートリアルの反撃でボスHPが削れると、全成功したプレイヤーほど
    // 早くボスが落ちて最終布団へ到達できない (仕様 §17)。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({ clock, frameLoop: loop, random: () => 0 });

    const steps: { index: number; phase: string; attackId: string }[] = [];
    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'SEQUENCE_STEP_STARTED') {
        steps.push({ index: event.stepIndex, phase: event.phase, attackId: event.attackId });
      }

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

      // 1つの反撃機会につき1回だけ入力する。大ダウン中に連打すると
      // 追撃ぶんだけ余計にHPが削れ、「全成功」の定義が曖昧になる。
      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
      }

      if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') break;
    }

    // チュートリアル5手 + 本戦7手をすべて通る。
    expect(steps.map((step) => `${step.phase}:${step.attackId}`)).toEqual([
      'TUTORIAL:PILLOW_SWEEP',
      'TUTORIAL:PILLOW_SWEEP',
      'TUTORIAL:YAWN_WAVE',
      'TUTORIAL:YAWN_WAVE',
      'TUTORIAL:FLUFFY_FUTON',
      'MAIN:PILLOW_SWEEP',
      'MAIN:YAWN_WAVE',
      'MAIN:PILLOW_SWEEP',
      'MAIN:YAWN_WAVE',
      'MAIN:FLUFFY_FUTON',
      'MAIN:PILLOW_SWEEP',
      'MAIN:FLUFFY_FUTON',
    ]);
    // 決着は最終手。チュートリアルの布団で満たされない形で確かめる。
    expect(steps.at(-1)).toEqual({ index: 11, phase: 'MAIN', attackId: 'FLUFFY_FUTON' });
    expect(useGameStore.getState().combatState).toBe('BOSS_DEFEATED');
  });

  it('チュートリアルの反撃ではボスHPを削らない', () => {
    // 仕様 §17 はダメージ量を本戦の行にだけ書いている。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      mainSequence: [{ slot: 'PILLOW_SWEEP', assist: false }],
    });

    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_VISUAL_CUE') {
        pendingDefense = event.cue.includes('left') ? 'DODGE_RIGHT' : 'DODGE_LEFT';
      }
      if (event.type === 'JUDGED') shouldCounter = event.result === 'PERFECT_DODGE';
    });

    tick();

    // チュートリアル1手目だけを成功させる。
    for (let frame = 0; frame < 200; frame += 1) {
      clock.advance(50);
      tick();

      const { combatState } = useGameStore.getState();
      if (combatState === 'ATTACK' && pendingDefense !== null) {
        session.submitAction(pendingDefense);
        pendingDefense = null;
      }
      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
        // 反撃が DAMAGE へ入るまで進めてから抜ける。
        for (let settle = 0; settle < 20; settle += 1) {
          clock.advance(50);
          tick();
        }
        break;
      }
    }

    expect(useGameStore.getState().bossHp).toBe(INITIAL_BOSS_HP);
  });

  it('チュートリアルの補助付きの手では被弾ペナルティを軽くする', () => {
    // 仕様 §16「初回失敗時のペナルティは軽くする」。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    createCombatSession({ clock, frameLoop: loop, random: () => 0 });

    const advance = (ms: number) => {
      clock.advance(ms);
      tick();
    };

    tick();
    advance(3_100);

    // 何も入力せず1手目を被弾する。
    for (let frame = 0; frame < 40; frame += 1) {
      advance(200);
      if (useGameStore.getState().sleepiness > 0) break;
    }

    // 枕の既定は12。補助付きのチュートリアル1手目は半減する。
    expect(useGameStore.getState().sleepiness).toBe(
      DEFAULT_ATTACK_DAMAGE.PILLOW_SWEEP.sleepinessDamage / 2,
    );
  });

  it('戦闘を作り直すと前の戦闘の補助表示が残らない', () => {
    // store はセッションより長く生きるので、前の戦闘の進行状態が
    // 次の INTRO へ持ち越されないことを見る。
    useGameStore.setState({ sequencePhase: 'MAIN', assistVisible: true });

    createCombatSession({
      clock: createFakeClock(),
      frameLoop: createManualLoop().loop,
      random: () => 0,
    });

    expect(useGameStore.getState()).toMatchObject({
      sequencePhase: 'TUTORIAL',
      assistVisible: false,
    });
  });

  it('使いかけのシーケンスを渡して作り直しても先頭から出し直す', () => {
    // RESULT-008 の「Attack Sequence位置」。外から渡したシーケンスは
    // 前の戦闘で進んでいることがある。
    const sequence = createAttackSequence({ random: () => 0 });
    sequence.next();
    sequence.next();

    createCombatSession({
      clock: createFakeClock(),
      frameLoop: createManualLoop().loop,
      random: () => 0,
      sequence,
    });

    expect(sequence.index).toBe(0);
    expect(sequence.phase).toBe('TUTORIAL');
  });
});
