import { beforeEach, describe, expect, it } from 'vitest';

import { createGameEventBus } from '@/game/events/game-event';
import { INITIAL_BOSS_HP } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { syncHudWithGameEvents } from './game-event-sync';

describe('syncHudWithGameEvents', () => {
  beforeEach(() => {
    useGameStore.setState({
      bossHp: INITIAL_BOSS_HP,
      sleepiness: 0,
      lastAttackId: null,
      lastInputRejection: null,
      lastResult: null,
    });
  });

  it('戦闘イベントをHUDの表示状態へ反映する', () => {
    const eventBus = createGameEventBus();
    const unsubscribe = syncHudWithGameEvents(eventBus);

    eventBus.emit({ type: 'ATTACK_STARTED', attackId: 'YAWN_WAVE' });
    eventBus.emit({ type: 'JUDGED', result: 'HIT' });
    eventBus.emit({ type: 'BOSS_HP_CHANGED', hp: 85 });
    eventBus.emit({ type: 'SLEEPINESS_CHANGED', value: 18 });

    expect(useGameStore.getState()).toMatchObject({
      lastAttackId: 'YAWN_WAVE',
      lastResult: 'HIT',
      bossHp: 85,
      sleepiness: 18,
    });

    unsubscribe();
  });

  it('早押しと空振りをイベントメッセージ用の結果として反映する', () => {
    const eventBus = createGameEventBus();
    syncHudWithGameEvents(eventBus);

    eventBus.emit({ type: 'INPUT_REJECTED', action: 'DODGE_LEFT', reason: 'TOO_EARLY' });
    expect(useGameStore.getState().lastResult).toBe('TOO_EARLY');

    eventBus.emit({ type: 'INPUT_REJECTED', action: 'ATTACK', reason: 'WHIFF' });
    expect(useGameStore.getState().lastResult).toBe('MISS');
    expect(useGameStore.getState().lastInputRejection).toBe('WHIFF');
  });

  it('購読解除後はHUDの状態を更新しない', () => {
    const eventBus = createGameEventBus();
    const unsubscribe = syncHudWithGameEvents(eventBus);
    unsubscribe();

    eventBus.emit({ type: 'BOSS_HP_CHANGED', hp: 85 });

    expect(useGameStore.getState().bossHp).toBe(INITIAL_BOSS_HP);
  });
});
