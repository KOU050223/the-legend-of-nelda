import type { BossBattle } from '../session/boss-battle';
import type { MovementInput } from '../movement/types';
import { decide } from './utility-policy';
import type { NpcPolicy } from './npc-policy';

/**
 * 人間が操作していないキャラへ NPC の判断を流す薄い層。Issue #158。
 *
 * 所有の解決と `battle.submit` への受け渡しだけを行い、判断そのものは
 * `NpcPolicy` が持つ。`BossBattle` には手を入れない。
 */

export interface NpcDriverOptions {
  /** roster 上の全プレイヤーID。 */
  readonly rosterIds: readonly string[];
  /**
   * 人間が操作しているプレイヤーID を返す。**毎フレーム読み直す。**
   *
   * ここで固定すると、操作キャラの切り替え (#106) 後も NPC が人間と同じ
   * キャラを動かし続け、移動入力が毎フレーム打ち消し合う。
   * `createLocalBattleSource` が送信のたびに `readLocalPlayerId()` を
   * 読み直しているのと同じ理由。
   */
  readonly readLocalPlayerId: () => string;
  /** 判断の実装。既定はユーティリティベース。テストで差し替える。 */
  readonly policy?: NpcPolicy;
}

/**
 * NPC を動かすのに要る戦闘の口だけ。
 *
 * `BossBattle` 全体を要求しない。ドライバが使うのは snapshot を読んで
 * submit することだけで、狭く取っておくとテストのスタブも素直に書ける。
 */
export type BattleForNpc = Pick<BossBattle, 'submit' | 'snapshot'>;

export interface NpcDriver {
  /** 1フレームぶん、NPC 全員の判断を戦闘へ流す。 */
  tick(battle: BattleForNpc): void;
}

export function createNpcDriver(options: NpcDriverOptions): NpcDriver {
  const policy = options.policy ?? decide;

  /**
   * 直前に送った移動入力。同じ値を毎フレーム送らないために覚えておく。
   *
   * `MOVE` は押しっぱなしの状態として `Player` に残る (`moveInput`) ので、
   * 同じ方向を送り続ける必要はない。毎フレーム送っても結果は変わらないが、
   * マルチで同じポリシーを使うときに無駄な送信が乗るため、変化したときだけ送る。
   */
  const lastMovement = new Map<string, MovementInput>();

  return {
    tick(battle) {
      const snapshot = battle.snapshot();
      const humanId = options.readLocalPlayerId();

      for (const npcId of options.rosterIds) {
        // 人間が操作しているキャラは NPC の担当から外す。
        if (npcId === humanId) {
          lastMovement.delete(npcId);
          continue;
        }

        const decision = policy(snapshot, { selfId: npcId });

        const previous = lastMovement.get(npcId);
        if (
          previous === undefined ||
          previous.forward !== decision.movement.forward ||
          previous.right !== decision.movement.right
        ) {
          battle.submit(npcId, { type: 'MOVE', input: decision.movement });
          lastMovement.set(npcId, decision.movement);
        }

        if (decision.action !== null) battle.submit(npcId, decision.action);
      }
    },
  };
}
