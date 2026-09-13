import { beforeEach, describe, expect, it } from 'vitest';

import { createGameEventBus } from '@/game/events/game-event';
import { INITIAL_BOSS_HP } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { syncHudWithGameEvents } from './game-event-sync';

describe('syncHudWithGameEvents', () => {
  beforeEach(() => {
    useGameStore.setState({
      combatState: 'INTRO',
      bossHp: INITIAL_BOSS_HP,
      sleepiness: 0,
      lastAttackId: null,
      eventFeedback: null,
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
      eventFeedback: { kind: 'RESULT', result: 'HIT', attackId: 'YAWN_WAVE' },
      bossHp: 85,
      sleepiness: 18,
    });

    unsubscribe();
  });

  it('弾かれた入力を判定結果とは別のイベントとして扱う', () => {
    const eventBus = createGameEventBus();
    syncHudWithGameEvents(eventBus);

    eventBus.emit({ type: 'INPUT_REJECTED', action: 'DODGE_LEFT', reason: 'TOO_EARLY' });
    expect(useGameStore.getState().eventFeedback).toEqual({
      kind: 'REJECTION',
      reason: 'TOO_EARLY',
    });

    eventBus.emit({ type: 'INPUT_REJECTED', action: 'ATTACK', reason: 'WHIFF' });
    expect(useGameStore.getState().eventFeedback).toEqual({ kind: 'REJECTION', reason: 'WHIFF' });
  });

  it('戦闘状態の遷移を表示状態へ反映する', () => {
    const eventBus = createGameEventBus();
    syncHudWithGameEvents(eventBus);

    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'INTRO', to: 'IDLE' });

    expect(useGameStore.getState().combatState).toBe('IDLE');
  });

  it('次の技が始まったら前の技のイベント表示を持ち越さない', () => {
    const eventBus = createGameEventBus();
    syncHudWithGameEvents(eventBus);

    eventBus.emit({ type: 'ATTACK_STARTED', attackId: 'YAWN_WAVE' });
    eventBus.emit({ type: 'JUDGED', result: 'HIT' });
    eventBus.emit({ type: 'ATTACK_STARTED', attackId: 'FLUFFY_FUTON' });

    expect(useGameStore.getState().eventFeedback).toBeNull();
  });

  it('反撃成立中は反撃のイベントを出し、明けたら残さない', () => {
    const eventBus = createGameEventBus();
    syncHudWithGameEvents(eventBus);

    eventBus.emit({ type: 'ATTACK_STARTED', attackId: 'FLUFFY_FUTON' });
    eventBus.emit({ type: 'JUDGED', result: 'PERFECT_DODGE' });
    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'COUNTER_WINDOW', to: 'BOSS_DOWN' });

    expect(useGameStore.getState().eventFeedback).toEqual({ kind: 'COUNTER' });

    // 大ダウンが明けても、覆い隠していた回避成功が復活しない。
    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'BOSS_DOWN', to: 'IDLE' });

    expect(useGameStore.getState().eventFeedback).toBeNull();
  });

  it('購読解除後はHUDの状態を更新しない', () => {
    const eventBus = createGameEventBus();
    const unsubscribe = syncHudWithGameEvents(eventBus);
    unsubscribe();

    eventBus.emit({ type: 'BOSS_HP_CHANGED', hp: 85 });

    expect(useGameStore.getState().bossHp).toBe(INITIAL_BOSS_HP);
  });
});
