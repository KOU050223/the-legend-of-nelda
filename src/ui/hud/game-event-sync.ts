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
        // recordAttack が前の技のフィードバックを捨てる。次の技が始まった時点で
        // 前の演出を消さないと、表示が攻撃フェーズを跨いで残る (UI-008)。
        if (isAttackId(event.attackId)) store.recordAttack(event.attackId);
        return;
      case 'SEQUENCE_STEP_STARTED':
        // 補助表示の可否はシーケンスだけが決める。UI 側が
        // 「チュートリアルかどうか」を技IDから推測しないための一方向転写。
        store.recordSequenceStep({ phase: event.phase, assist: event.assist });
        return;
      case 'JUDGED':
        store.recordResult(event.result);
        return;
      case 'INPUT_REJECTED':
        store.recordInputRejection(event.reason);
        return;
      case 'COMBAT_STATE_CHANGED':
        store.setCombatState(event.to);

        // 大ダウンは反撃の成立そのものなので、直前の判定結果を COUNTER! で
        // 覆い隠すのではなく消費する。残したままだと大ダウンが明けた瞬間に
        // 古い結果が復活して再表示される (UI-008)。
        if (event.to === 'BOSS_DOWN') {
          store.recordCounter();
          return;
        }

        // 大ダウンを抜けたら COUNTER! 自体も消費する。State が変わっただけで
        // 演出が再生され直さないようにする。
        if (event.from === 'BOSS_DOWN') store.clearEventFeedback();
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
