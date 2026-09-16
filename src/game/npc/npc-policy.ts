import type { BattleSnapshot } from '../session/boss-battle';
import type { MovementInput } from '../movement/types';
import type { GameAction } from '../types/game-action';

/**
 * ソロプレイ中、人間が操作していないキャラを動かす意思決定。Issue #158。
 *
 * NPC は Keyboard / マイク / ARマーカー と並ぶ**もう1つの入力源**として置く。
 * `BossBattle.submit(playerId, action)` は playerId を引数で受けるので、
 * 誰が送ってきたかを問わない。したがって `BossBattle` も `player-state.ts` も
 * 触らずに済む (docs/20260916_npc-design.md)。
 *
 * ## `AttachInputAdapter` を使わない理由
 *
 * 既存の `AttachInputAdapter` は push 型で、**世界の状態を読む口がない**。
 * NPC は「ボスが今どの技の予兆に入っているか」を見て判断する必要があるため
 * 契約が合わない。無理に合わせると入力アダプタ側へ snapshot を流し込む口を
 * 開けることになり、「入力源は世界を知らない」という既存の規律
 * (§16 / technical-design.md §5.2) を壊す。そこで兄弟の契約をここへ置く。
 *
 * ## snapshot の純関数にしてある
 *
 * `Player` や `HoriBoss` の実体を受け取らず `BattleSnapshot` だけを見る。
 * fake clock だけでヘッドレスにテストでき、将来 Authority
 * (`src/multiplayer/battle-room.ts`) の update ループから呼んでも成立する。
 * 本 Issue ではローカルでしか呼ばない。
 */
export type NpcPolicy = (snapshot: BattleSnapshot, context: NpcContext) => NpcDecision;

export interface NpcContext {
  /** このポリシーが動かすプレイヤーの roster ID。 */
  readonly selfId: string;
}

/**
 * NPC が1フレームに出す行動。**移動と離散アクションを分けてある**。
 *
 * `MOVE` は押しっぱなしの状態として `Player` に残る
 * (`player-state.ts` の `moveInput = action.input`)。つまり一度送った移動は
 * 次の `MOVE` が上書きするまで続く。「毎フレーム最もスコアの高い行動を1つ送る」
 * 形にすると、`ATTACK` や `REVIVE` が勝ったフレームは `MOVE` が送られず、
 * NPC は直前の方向へ滑り続ける。ゼロベクトルを送る機会が無いので**止まれず**、
 * 倒れた仲間の隣で停止して蘇生する、ができない。
 *
 * この分け方は `game-action.ts` が既に書いている区別
 * (「`MOVE` だけが連続値を持ち、他は押した瞬間の離散イベント」) と同じで、
 * NPC 側だけの都合ではない。
 */
export interface NpcDecision {
  /** 毎フレーム必ず出す。止まるときも `{ forward: 0, right: 0 }`。 */
  readonly movement: MovementInput;
  /** その瞬間に1つだけ。出さないフレームは null。 */
  readonly action: NpcDiscreteAction | null;
}

/** NPC が出せる離散アクション。移動は `NpcDecision.movement` が持つ。 */
export type NpcDiscreteAction = Exclude<GameAction, { type: 'MOVE' }>;

/** 止まっている移動入力。 */
export const NO_MOVEMENT: MovementInput = { forward: 0, right: 0 };

/** 何もしない決定。寝ている NPC などが返す。 */
export const IDLE_DECISION: NpcDecision = { movement: NO_MOVEMENT, action: null };
