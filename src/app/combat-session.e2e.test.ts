import { beforeEach, describe, expect, it } from 'vitest';

import { createSilentAudioOutput } from '@/audio/audio-output';
import { createFakeClock } from '@/game/clock';
import type { GameEvent } from '@/game/events/game-event';
import type { PlayerAction } from '@/game/types';
import { useGameStore } from '@/store/game-store';

import { createCombatSession, type FrameLoop } from './combat-session';

/** E2Eの時間を実時間に依存させず、フレーム単位で進める。 */
function createManualLoop(): { loop: FrameLoop; tick: () => void } {
  let onFrame: (() => void) | null = null;

  return {
    loop: (frame) => {
      onFrame = frame;
      return () => {
        onFrame = null;
      };
    },
    tick: () => onFrame?.(),
  };
}

function createScenario(options: Parameters<typeof createCombatSession>[0] = {}) {
  const clock = createFakeClock();
  const { loop, tick } = createManualLoop();
  const session = createCombatSession({
    clock,
    frameLoop: loop,
    random: () => 0,
    audioOutput: createSilentAudioOutput(),
    ...options,
  });
  const events: GameEvent[] = [];
  session.eventBus.subscribe((event) => events.push(event));

  return {
    clock,
    events,
    session,
    step(ms = 50) {
      clock.advance(ms);
      tick();
    },
  };
}

function defensiveAction(event: GameEvent): PlayerAction | null {
  if (event.type !== 'ATTACK_VISUAL_CUE' || event.phase === 'ACTIVATION') return null;
  if (event.cue.includes('left')) return 'DODGE_RIGHT';
  if (event.cue.includes('right')) return 'DODGE_LEFT';
  return 'GUARD';
}

/**
 * Cueを読んでから、受付開始ちょうどに押すまでの時間。
 *
 * 全成功でも一切待たないボットは実プレイのテンポを計測できないため、各技の
 * 受付開始を使う。この操作は仕様上の正解入力で、初見に期待する「予兆を見て
 * 判断して押す」時間を含む。
 */
function defenseDelayMs(event: GameEvent): number {
  if (event.type !== 'ATTACK_VISUAL_CUE') return 0;
  if (event.attackId === 'YAWN_WAVE') return 1_750;
  return event.attackId === 'FLUFFY_FUTON' ? 2_200 : 1_000;
}

/** 正解防御と反撃を行う。チュートリアルも本戦も同じ入力規則で進める。 */
function playUntilTerminal({
  scenario,
  skipFirstDefense = false,
  skipFutonCounter = false,
}: {
  scenario: ReturnType<typeof createScenario>;
  skipFirstDefense?: boolean;
  skipFutonCounter?: boolean;
}): void {
  let eventIndex = 0;
  let pendingDefense: { action: PlayerAction; at: number } | null = null;
  let counterAt: number | null = null;
  let defensesSkipped = 0;
  let futonCounterSkipped = false;
  let counterSkippedThisWindow = false;

  for (let frame = 0; frame < 4_000; frame += 1) {
    scenario.step();

    for (const event of scenario.events.slice(eventIndex)) {
      const action = defensiveAction(event);
      if (action) pendingDefense = { action, at: scenario.clock.now() + defenseDelayMs(event) };
    }
    eventIndex = scenario.events.length;

    const { combatState, lastAttackId } = useGameStore.getState();
    if (pendingDefense && scenario.clock.now() >= pendingDefense.at) {
      if (skipFirstDefense && defensesSkipped === 0) defensesSkipped += 1;
      else scenario.session.submitAction(pendingDefense.action);
      pendingDefense = null;
    }
    if (combatState === 'COUNTER_WINDOW') {
      counterAt ??= scenario.clock.now() + (lastAttackId === 'FLUFFY_FUTON' ? 300 : 1_000);
      if (scenario.clock.now() < counterAt) continue;
      if (skipFutonCounter && !futonCounterSkipped) {
        futonCounterSkipped = true;
        counterSkippedThisWindow = true;
      } else if (!counterSkippedThisWindow) {
        scenario.session.submitAction('ATTACK');
      } else {
        continue;
      }
      counterAt = null;
    } else {
      counterAt = null;
      counterSkippedThisWindow = false;
    }
    if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') return;
  }

  throw new Error('戦闘が決着せず、E2Eの上限フレームに達しました。');
}

describe('Phase 1通しプレイ', () => {
  beforeEach(() => useGameStore.getState().reset());

  it('E2E-001: 全成功で最終ふかふか布団まで進み、60〜90秒で勝利演出へ入る', () => {
    const scenario = createScenario();

    playUntilTerminal({ scenario });

    expect(useGameStore.getState()).toMatchObject({
      combatState: 'BOSS_DEFEATED',
      bossHp: 0,
      result: { outcome: 'victory' },
    });
    expect(
      scenario.events.findLast((event) => event.type === 'SEQUENCE_STEP_STARTED'),
    ).toMatchObject({
      attackId: 'FLUFFY_FUTON',
      phase: 'MAIN',
      stepIndex: 11,
    });
    expect(scenario.clock.now()).toBeGreaterThanOrEqual(60_000);
    expect(scenario.clock.now()).toBeLessThanOrEqual(90_000);
  });

  it('E2E-002: 防御しなければ眠気100で敗北し、攻撃シーケンスは停止する', () => {
    const scenario = createScenario();

    for (
      let frame = 0;
      frame < 4_000 && useGameStore.getState().combatState !== 'PLAYER_LOSE';
      frame += 1
    ) {
      scenario.step();
    }
    const stepsAtLose = scenario.events.filter(
      (event) => event.type === 'SEQUENCE_STEP_STARTED',
    ).length;
    for (let frame = 0; frame < 200; frame += 1) scenario.step();

    expect(useGameStore.getState()).toMatchObject({
      combatState: 'PLAYER_LOSE',
      sleepiness: 100,
      result: { outcome: 'defeat' },
    });
    expect(scenario.events.filter((event) => event.type === 'SEQUENCE_STEP_STARTED')).toHaveLength(
      stepsAtLose,
    );
  });

  it('E2E-003: 枕を一度受けても進行が壊れず、以後の成功で勝利できる', () => {
    const scenario = createScenario();

    playUntilTerminal({ scenario, skipFirstDefense: true });

    expect(useGameStore.getState()).toMatchObject({
      combatState: 'BOSS_DEFEATED',
      bossHp: 0,
      result: { outcome: 'victory' },
    });
    expect(scenario.events).toContainEqual({ type: 'SLEEPINESS_CHANGED', value: 6 });
  });

  it('E2E-004: 布団を避けて反撃を見送っても大ダウンせず、次の技へ進む', () => {
    const scenario = createScenario({
      tutorialSequence: [],
      mainSequence: [
        { slot: 'FLUFFY_FUTON', assist: false },
        { slot: 'PILLOW_SWEEP', assist: false },
      ],
    });

    playUntilTerminal({ scenario, skipFutonCounter: true });

    const nextStep = scenario.events.findIndex(
      (event) => event.type === 'SEQUENCE_STEP_STARTED' && event.stepIndex === 1,
    );
    const statesBeforeNextAttack = scenario.events
      .slice(0, nextStep)
      .filter((event) => event.type === 'COMBAT_STATE_CHANGED')
      .map((event) => event.to);
    const started = scenario.events
      .filter((event) => event.type === 'SEQUENCE_STEP_STARTED')
      .map((event) => event.attackId);

    expect(statesBeforeNextAttack).not.toContain('BOSS_DOWN');
    expect(started.slice(0, 2)).toEqual(['FLUFFY_FUTON', 'PILLOW_SWEEP']);
    expect(useGameStore.getState().sleepiness).toBe(0);
  });
});
