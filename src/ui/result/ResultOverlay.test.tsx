import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('勝利後は既存の結果と再戦操作を順に表示する', () => {
    const to = 'BOSS_DEFEATED' as const;
    const title = 'SLEEP DEMON DEFEATED';
    const subtitle = 'WAKE FORCE COMPLETE';
    const clock = createFakeClock();
    const bus = createGameEventBus();
    const presentation = syncResultWithGameEvents(bus, clock);
    dispose = () => presentation.dispose();
    render(<ResultOverlay onRestart={() => {}} onTitle={() => {}} />);

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

  it('敗北後は字幕を段階表示してからBAD ENDと再戦操作を表示する', () => {
    const clock = createFakeClock();
    const bus = createGameEventBus();
    const presentation = syncResultWithGameEvents(bus, clock);
    dispose = () => presentation.dispose();
    render(<ResultOverlay onRestart={() => {}} onTitle={() => {}} />);

    act(() => bus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'HIT', to: 'PLAYER_LOSE' }));

    act(() => {
      clock.advance(4_000);
      presentation.update();
    });
    expect(screen.getByText('全員が、眠ってしまった。')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    act(() => {
      clock.advance(3_000);
      presentation.update();
    });
    expect(screen.getByRole('heading', { name: 'BAD END' })).toBeInTheDocument();
    expect(screen.getByText('世界の安眠が失われた。')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    act(() => {
      clock.advance(2_000);
      presentation.update();
    });
    expect(screen.getByRole('button', { name: /RESTART/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /タイトルへ戻る/ })).toBeInTheDocument();
  });

  it('BAD END後にタイトルへ戻る操作を表示する', () => {
    const onTitle = vi.fn<() => void>();
    useGameStore.setState({ result: { outcome: 'defeat', elapsedMs: 9_000 } });

    render(<ResultOverlay onRestart={() => {}} onTitle={onTitle} />);
    fireEvent.click(screen.getByRole('button', { name: /タイトルへ戻る/ }));

    expect(onTitle).toHaveBeenCalledOnce();
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
