import { beforeEach, describe, expect, it } from 'vitest';

import { createFakeClock } from '@/game/clock';
import type { GameEvent } from '@/game/events/game-event';
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
});
