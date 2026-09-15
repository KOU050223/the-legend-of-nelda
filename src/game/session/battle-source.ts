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

/**
 * 既存のBossBattleをBattleSourceへ適合させる。
 *
 * 操作するプレイヤーを関数で受け取れるようにしてある。ローカルでは画面から
 * 操作キャラを切り替えられる (Issue #106) ので、固定のIDを閉じ込めると
 * 切り替えても入力が前のキャラへ飛び続ける。送るたびに読み直す。
 */
export function createLocalBattleSource(
  battle: BossBattle,
  localPlayerId: string | (() => string),
): BattleSource {
  const stateHandlers = new Set<(snapshot: BattleSnapshot) => void>();
  const readLocalPlayerId = (): string =>
    typeof localPlayerId === 'function' ? localPlayerId() : localPlayerId;

  return {
    // 参照した時点の操作キャラ。リモートと違い、ローカルでは切り替わる。
    get localPlayerId() {
      return readLocalPlayerId();
    },
    kind: 'LOCAL',

    submit(action) {
      battle.submit(readLocalPlayerId(), action);
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
