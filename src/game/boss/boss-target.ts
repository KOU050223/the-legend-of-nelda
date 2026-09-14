import type { PlanarPosition } from '../movement/types';

/**
 * ボスから見たプレイヤー。#56 (3人共通の基本アクション) がまだ無いため、
 * ボス側が必要とする最小限だけをここで定義する。
 *
 * #56 のプレイヤー実装ができたら、そちらの型がこの interface を満たすように
 * すればよく、ボス側のロジックは触らずに済む。逆にここでプレイヤーの
 * 完全な型を import すると、#56 の都合でボスのテストが壊れる。
 */
export interface BossTarget {
  readonly id: string;
  readonly position: PlanarPosition;
  /** 回避の無敵時間中など、判定を素通りする状態か。#56 の回避が繋ぎ込む。 */
  readonly invulnerable?: boolean;
}

/** ボスの攻撃が当たった結果。誰にいくら入ったか。 */
export interface DamageHit {
  readonly targetId: string;
  readonly amount: number;
}

/**
 * ダメージの適用先。ボスはプレイヤーのHPを直接書き換えず、ここへ渡す。
 *
 * プレイヤーHPの真実源は #56 が持つ。ボスが直接触ると、同期を後付けする際に
 * 「誰がHPを確定させるのか」が2箇所になる (Issue #58 のスナップショット要件と
 * 同じ理由)。
 */
export interface DamageSink {
  applyDamage(hit: DamageHit): void;
}
