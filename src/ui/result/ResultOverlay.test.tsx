import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createFakeClock } from '@/game/clock';
import { createGameEventBus } from '@/game/events/game-event';
import { useGameStore } from '@/store/game-store';
import { ResultOverlay } from './ResultOverlay';
import { syncResultWithGameEvents } from './result-presentation';

describe('ResultOverlay', () => {
  let dispose: (() => void) | undefined;
  beforeEach(() => useGameStore.getState().reset());
  afterEach(() => {
    cleanup();
    dispose?.();
  });

  it.each([
    {
      to: 'BOSS_DEFEATED' as const,
      title: 'SLEEP DEMON DEFEATED',
      subtitle: 'WAKE FORCE COMPLETE',
    },
    { to: 'PLAYER_LOSE' as const, title: 'HORI FELL ASLEEP', subtitle: 'Zzz...' },
  ])('$to の決着後に間を置いて結果と再戦操作を順に表示する', ({ to, title, subtitle }) => {
    const clock = createFakeClock();
    const bus = createGameEventBus();
    const presentation = syncResultWithGameEvents(bus, clock);
    dispose = () => presentation.dispose();
    render(<ResultOverlay onRestart={() => {}} />);

    act(() => bus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'HIT', to }));

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    act(() => {
      clock.advance(1799);
      presentation.update();
    });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    act(() => {
      clock.advance(1);
      presentation.update();
    });
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByText(subtitle)).not.toBeInTheDocument();
    act(() => {
      clock.advance(700);
      presentation.update();
    });
    expect(screen.getByText(subtitle)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => {
      clock.advance(700);
      presentation.update();
    });
    expect(screen.getByRole('button', { name: /RESTART/ })).toBeInTheDocument();
  });

  it('同じ戦いで決着通知が重なっても演出を巻き戻さず、破棄後は更新しない (RESULT-004/005)', () => {
    const clock = createFakeClock();
    const bus = createGameEventBus();
    const presentation = syncResultWithGameEvents(bus, clock);
    dispose = () => presentation.dispose();
    bus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'DAMAGE', to: 'BOSS_DEFEATED' });
    clock.advance(2000);
    presentation.update();

    bus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'DAMAGE', to: 'BOSS_DEFEATED' });
    bus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'HIT', to: 'PLAYER_LOSE' });

    expect(useGameStore.getState().result).toEqual({ outcome: 'victory', elapsedMs: 2000 });
    presentation.dispose();
    useGameStore.getState().reset();
    clock.advance(5000);
    presentation.update();
    bus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'HIT', to: 'PLAYER_LOSE' });
    expect(useGameStore.getState().result).toBeNull();
  });
});
