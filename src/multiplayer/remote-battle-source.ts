import type { GameAction } from '../game/types/game-action';
import type { BattleSnapshot } from '../game/session/boss-battle';
import type { createRealtimeBattleClient } from './realtime-battle-client';
import type { BattleSource } from '../game/session/battle-source';

type RealtimeBattleClient = ReturnType<typeof createRealtimeBattleClient>;

/** RealtimeBattleClientをBattleSourceへ適合させる。時間はサーバーが進める。 */
export function createRemoteBattleSource(
  client: RealtimeBattleClient,
  localPlayerId: string,
): BattleSource {
  return {
    localPlayerId,
    kind: 'REMOTE',

    submit(action: GameAction) {
      client.submit(action);
    },

    onState(handler: (snapshot: BattleSnapshot) => void) {
      return client.onState(handler);
    },

    tick() {
      // リモート戦闘の時間はサーバー権威で進む。
    },
  };
}
