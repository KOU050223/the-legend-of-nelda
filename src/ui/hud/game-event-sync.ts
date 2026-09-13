import { ATTACK_IDS } from '@/game/config/combat-balance';
import type { AttackId } from '@/game/config/combat-balance';
import type { GameEventBus } from '@/game/events/game-event';
import { useGameStore } from '@/store/game-store';

function isAttackId(attackId: string): attackId is AttackId {
  return (ATTACK_IDS as readonly string[]).includes(attackId);
}

/**
 * Game Logic のイベントを Presentation State へ一方向に転写する。
 * UI はこの状態を読むだけで、戦闘ルールやイベントバスを書き換えない。
 */
export function syncHudWithGameEvents(eventBus: GameEventBus): () => void {
  return eventBus.subscribe((event) => {
    const store = useGameStore.getState();

    switch (event.type) {
      case 'ATTACK_STARTED':
        if (isAttackId(event.attackId)) store.recordAttack(event.attackId);
        return;
      case 'JUDGED':
        store.recordResult(event.result);
        return;
      case 'INPUT_REJECTED':
        useGameStore.setState((state) => ({
          lastInputRejection: event.reason,
          lastResult: event.reason === 'TOO_EARLY' ? 'TOO_EARLY' : 'MISS',
          eventSequence: state.eventSequence + 1,
        }));
        return;
      case 'BOSS_HP_CHANGED':
        store.setBossHp(event.hp);
        return;
      case 'SLEEPINESS_CHANGED':
        store.setSleepiness(event.value);
        return;
      default:
        return;
    }
  });
}
