import type { CharacterId } from '../config/phase2-player-balance';

/**
 * NPC の性格。docs/phase2-role-design-spec.md の役割を重みで表す。
 *
 * `CHARACTER_STATS` と同じ規律で、**キャラ差をデータとして分離する**
 * (#56 完了条件「キャラごとの性能差がデータとして分離されている
 * （コード分岐にしない）」)。NPC を状態機械で書くと
 * 「オドルノは前に出る / Pay は下がる」が遷移条件の `if` になり、この規律を
 * 破る。行動をスコアで選び、重みだけをここへ置けば分岐は1行も要らない。
 *
 * プレイテストでの調整もこのテーブルだけで済む。
 */
export interface NpcWeights {
  /** ボスへ近寄って殴りたい度合い。 */
  readonly aggression: number;
  /** 危険範囲・予兆から身を守りたい度合い。 */
  readonly selfPreservation: number;
  /** 倒れた仲間を起こしに行きたい度合い。 */
  readonly rescue: number;
  /** 攻撃が届いた後も距離を保ちたい度合い。大きいほど離れて戦う。 */
  readonly spacing: number;
}

/**
 * 3人の性格。#147 の性能差 (オド=体力 / オラ=攻撃力 / Pay=移動速度) と
 * 向きを揃える。性能で尖っている方向へ、行動の好みも寄せる。
 */
export const NPC_WEIGHTS: Readonly<Record<CharacterId, NpcWeights>> = {
  /**
   * 前線・耐久・救助担当。体力があるので前に出て殴り続けられる。
   * 倒れた仲間へ真っ先に向かうのは役割設計どおり
   * (「他プレイヤーが寝ようとしている場合、素早く救助へ向かう」)。
   */
  ODORUNO: { aggression: 1.0, selfPreservation: 0.6, rescue: 1.2, spacing: 0.7 },
  /**
   * 情報・判断担当。HP は標準で前線向きではないが移動速度が最も速い。
   * 距離を取って無理をせず、危険範囲からは真っ先に退く。
   */
  PAY: { aggression: 0.5, selfPreservation: 1.2, rescue: 0.9, spacing: 1.3 },
  /**
   * 攻撃力が最も高い。隙を見て寄り、殴ったら退く立ち回りにする。
   * HP はオドルノの半分なので、張り付き続けさせない。
   */
  ORA: { aggression: 1.1, selfPreservation: 0.9, rescue: 0.8, spacing: 1.0 },
};
