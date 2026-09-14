import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSilentAudioOutput } from '@/audio/audio-output';
import type * as AudioOutputModule from '@/audio/audio-output';
import { useVfxStore } from '@/rendering/vfx/vfx-store';
import { useGameStore } from '@/store/game-store';
import { BattleScreen } from './App';
import * as sessions from './combat-session';
import type { PlayerAction } from '@/game/types';

vi.mock('@/rendering/scene/GameScene', () => ({ GameScene: () => null }));
vi.mock('@/audio/audio-output', async (importOriginal) => {
  const actual = await importOriginal<typeof AudioOutputModule>();
  return { ...actual, createHtmlAudioOutput: actual.createSilentAudioOutput };
});

describe('戦闘画面', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('HPを削り切った勝利後は入力で再開せず、再戦すると戦闘と表示が初期化される (RESULT-001/004/006/008)', () => {
    const create = sessions.createCombatSession;
    const created: sessions.CombatSession[] = [];
    vi.spyOn(sessions, 'createCombatSession').mockImplementation(() => {
      const session = create({
        audioOutput: createSilentAudioOutput(),
        random: () => 0,
        tutorialSequence: [],
        mainSequence: [{ slot: 'PILLOW_SWEEP', assist: false }],
      });
      created.push(session);
      return session;
    });
    render(
      <StrictMode>
        <BattleScreen />
      </StrictMode>,
    );
    const session = created.at(-1)!;
    let defense: PlayerAction | null = null;
    let victories = 0;
    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_VISUAL_CUE')
        defense = event.cue.includes('left') ? 'DODGE_RIGHT' : 'DODGE_LEFT';
      if (event.type === 'COMBAT_STATE_CHANGED' && event.to === 'BOSS_DEFEATED') victories += 1;
    });

    act(() => {
      for (let frame = 0; frame < 6000; frame += 1) {
        vi.advanceTimersByTime(16);
        const state = useGameStore.getState().combatState;
        if (state === 'ATTACK' && defense) {
          session.submitAction(defense);
          defense = null;
        }
        if (state === 'COUNTER_WINDOW') session.submitAction('ATTACK');
        if (state === 'BOSS_DEFEATED') break;
      }
      vi.advanceTimersByTime(4000);
    });

    expect(useGameStore.getState().bossHp).toBe(0);
    expect(screen.getByRole('heading', { name: 'SLEEP DEMON DEFEATED' })).toBeInTheDocument();
    expect(screen.getByText('WAKE FORCE COMPLETE')).toBeInTheDocument();
    act(() => {
      session.submitAction('ATTACK');
      session.submitAction('DODGE_LEFT');
      vi.advanceTimersByTime(10000);
    });
    expect(victories).toBe(1);
    expect(useGameStore.getState().combatState).toBe('BOSS_DEFEATED');
    fireEvent.click(screen.getByRole('button', { name: /RESTART/ }));
    expect(useGameStore.getState()).toMatchObject({
      bossHp: 100,
      sleepiness: 0,
      combatState: 'INTRO',
      result: null,
      eventFeedback: null,
    });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '演出設定' })).toBeInTheDocument();
    expect(useVfxStore.getState().active).toEqual([]);
    act(() => {
      session.eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'DAMAGE', to: 'BOSS_DEFEATED' });
      session.eventBus.emit({ type: 'BOSS_HP_CHANGED', hp: 0 });
      session.submitAction('ATTACK');
    });
    expect(useGameStore.getState()).toMatchObject({
      bossHp: 100,
      combatState: 'INTRO',
      result: null,
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('StrictModeで3回敗北・再戦しても速度と入力回数が増えず、初期状態から始まる (RESULT-003/005/007/008)', () => {
    render(
      <StrictMode>
        <BattleScreen />
      </StrictMode>,
    );
    const eventCounts: number[] = [];

    for (let battle = 0; battle < 3; battle += 1) {
      expect(useGameStore.getState()).toMatchObject({
        combatState: 'INTRO',
        bossHp: 100,
        sleepiness: 0,
        result: null,
        eventFeedback: null,
        lastAction: null,
        sequencePhase: 'TUTORIAL',
        assistVisible: false,
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(useGameStore.getState().combatState).toBe('INTRO');
      const before = useGameStore.getState().eventSequence;
      fireEvent.keyDown(window, { code: 'KeyJ' });
      eventCounts.push(useGameStore.getState().eventSequence - before);
      act(() => {
        vi.advanceTimersByTime(120000);
      });
      expect(screen.getByRole('heading', { name: 'HORI FELL ASLEEP' })).toBeInTheDocument();
      const ended = useGameStore.getState();
      fireEvent.keyDown(window, { code: 'KeyJ' });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(useGameStore.getState()).toEqual(ended);
      fireEvent.click(screen.getByRole('button', { name: /RESTART/ }));
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: '演出設定' })).toBeInTheDocument();
      expect(useVfxStore.getState().active).toEqual([]);
      expect(vi.getTimerCount()).toBe(1);
    }
    expect(eventCounts).toEqual([1, 1, 1]);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});
