import type { GameClock } from '@/game/clock';
import type { GameEventBus } from '@/game/events/game-event';
import { useGameStore } from '@/store/game-store';

export const RESULT_TIMING = {
  hitStop: 200,
  reaction: 1100,
  title: 1800,
  subtitle: 2500,
  restart: 3200,
};

/** Terminal events alone trigger presentation. The session owns its clock and cleanup. */
export function syncResultWithGameEvents(eventBus: GameEventBus, clock: GameClock) {
  let startedAt: number | null = null;
  let disposed = false;
  const unsubscribe = eventBus.subscribe((event) => {
    if (startedAt !== null || event.type !== 'COMBAT_STATE_CHANGED') return;
    if (event.to !== 'BOSS_DEFEATED' && event.to !== 'PLAYER_LOSE') return;
    startedAt = clock.now();
    useGameStore.setState({
      result: { outcome: event.to === 'BOSS_DEFEATED' ? 'victory' : 'defeat', elapsedMs: 0 },
      eventFeedback: null,
      assistVisible: false,
    });
  });
  return {
    update() {
      const result = useGameStore.getState().result;
      if (disposed || startedAt === null || !result || result.elapsedMs >= RESULT_TIMING.restart)
        return;
      useGameStore.setState({
        result: { ...result, elapsedMs: Math.min(RESULT_TIMING.restart, clock.now() - startedAt) },
      });
    },
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}
