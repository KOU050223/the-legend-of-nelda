import type { GameAction } from '../types/game-action';
import type { BattleSnapshot, BossBattle } from './boss-battle';

/** ローカル実装とリモート実装を同じ描画ループへ接続する境界。 */
export interface BattleSource {
  readonly localPlayerId: string;
  readonly kind: 'LOCAL' | 'REMOTE';
  submit(action: GameAction): void;
  onState(handler: (snapshot: BattleSnapshot) => void): () => void;
  tick(deltaSeconds: number): void;
}

/** 既存のBossBattleをBattleSourceへ適合させる。 */
export function createLocalBattleSource(battle: BossBattle, localPlayerId: string): BattleSource {
  const stateHandlers = new Set<(snapshot: BattleSnapshot) => void>();

  return {
    localPlayerId,
    kind: 'LOCAL',

    submit(action) {
      battle.submit(localPlayerId, action);
    },

    onState(handler) {
      stateHandlers.add(handler);
      return () => {
        stateHandlers.delete(handler);
      };
    },

    tick(deltaSeconds) {
      battle.update(deltaSeconds);
      const snapshot = battle.snapshot();
      for (const handler of stateHandlers) handler(snapshot);
    },
  };
}
