import {
  BLUE_LIGHT_TRACKING_SPEED,
  COMPRESSION_FIELD_RING,
  COMPRESSION_FIELD_ZONE_COUNT,
  DEFAULT_HORI_ATTACKS,
  type HoriAttackId,
} from '../../config/phase2-boss-balance';
import { moveCharacter, facingRotationY } from '../../movement/movement';
import type { PlanarPosition } from '../../movement/types';
import type { BossTarget } from '../boss-target';
import type { DangerZone } from './danger-zone';

/**
 * 堀大輔の通常攻撃4種。docs/phase2-gameplay-spec.md §9。
 *
 * 各技は「予兆の時点で決まる狙い (`AttackAim`)」と「経過時間から危険範囲を
 * 求める関数」に分かれる。狙いを予兆の開始時に一度だけ固定するのは、
 * 予兆を見て回避したプレイヤーが、判定の瞬間に狙いを付け直されて
 * 当たることが無いようにするため (Issue #58「予兆を見て回避でき」)。
 *
 * 追尾する技 (ブルーライト照射) だけは例外で、追尾そのものが技の内容
 * (§9.2「走って逃げる」) なので、経過時間に応じて着弾点が動く。ただし
 * 追尾速度は上限付き (BLUE_LIGHT_TRACKING_SPEED) で、走れば振り切れる。
 */

/** 予兆の開始時に固定される狙い。技によって使うフィールドが違う。 */
export interface AttackAim {
  /** 狙われたプレイヤー。ブルーライト照射だけが使う。 */
  readonly targetId?: string;
  /** 予兆開始時のボス位置。 */
  readonly origin: PlanarPosition;
  /** 予兆開始時の狙いの向き (ラジアン)。突進が使う。 */
  readonly rotationY: number;
  /** 追尾の開始点 / 危険区画の中心。技ごとに意味が変わる。 */
  readonly points: readonly PlanarPosition[];
}

/**
 * 0〜1 の決定論的な擬似乱数。`Math.random()` は使わない。
 *
 * 同じ seed には常に同じ配置を返す。危険区画の配置がスナップショットから
 * 復元できる (Issue #58「シリアライズ可能なスナップショット」) ためには、
 * 乱数が seed だけで決まっている必要がある。
 *
 * `src/rendering/world/stage-layout.ts` の同名関数と同じ式。あちらは
 * Rendering 層にあり、Game Logic からは import できない
 * (.oxlintrc.json の no-restricted-imports)。式を共有するために
 * Rendering 側の都合をゲームロジックへ引き込む方が高くつくので、
 * 配置の意味が違う (props の飾り / 当たり判定を持つ危険区画) ことも含め
 * ここでは重複を受け入れる。
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 原点を中心としたリング状の帯へ、決定論的に点を並べる。
 * 睡眠時間圧縮フィールドの危険区画の配置に使う。
 */
function ringPoints(count: number, innerRadius: number, outerRadius: number, seed: number) {
  const points: PlanarPosition[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + pseudoRandom(seed + i * 2) * 0.5;
    const radius = innerRadius + pseudoRandom(seed + i * 2 + 1) * (outerRadius - innerRadius);
    points.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  }
  return points;
}

export interface AimContext {
  readonly bossPosition: PlanarPosition;
  readonly targets: readonly BossTarget[];
  /**
   * この技の狙いを決める seed。同じ seed からは同じ狙いが決まる。
   * 通常はボスが発動回数を渡す。
   */
  readonly seed: number;
}

/** 予兆の開始時に、その技の狙いを1度だけ決める。 */
export function aimAttack(attackId: HoriAttackId, context: AimContext): AttackAim {
  const { bossPosition, targets, seed } = context;

  switch (attackId) {
    case 'WAKE_UP_ALARM': {
      // 全方位。狙う向きも対象も無い。
      return { origin: bossPosition, rotationY: 0, points: [] };
    }

    case 'BLUE_LIGHT': {
      // 決定論的に1人を選ぶ。誰も居なければ狙いは空のまま。
      const target = targets[Math.floor(pseudoRandom(seed) * targets.length)];
      if (target === undefined) {
        return { origin: bossPosition, rotationY: 0, points: [] };
      }
      return {
        targetId: target.id,
        origin: bossPosition,
        rotationY: 0,
        // 着弾点はボスの足元から始まり、対象を追って動く。
        points: [bossPosition],
      };
    }

    case 'COMPRESSION_FIELD': {
      return {
        origin: bossPosition,
        rotationY: 0,
        points: ringPoints(
          COMPRESSION_FIELD_ZONE_COUNT,
          COMPRESSION_FIELD_RING.innerRadius,
          COMPRESSION_FIELD_RING.outerRadius,
          seed,
        ),
      };
    }

    default: {
      // MORNING_DASH。
      // 予兆の開始時に一番近いプレイヤーへ向きを固定する。以降は向きを
      // 変えない (§9.4「横方向へ回避する」が成立する条件)。
      const nearest = nearestTarget(bossPosition, targets);
      const rotationY =
        nearest === undefined
          ? 0
          : (facingRotationY({
              forward: bossPosition.z - nearest.position.z,
              right: nearest.position.x - bossPosition.x,
            }) ?? 0);
      return { origin: bossPosition, rotationY, points: [] };
    }
  }
}

function nearestTarget(
  from: PlanarPosition,
  targets: readonly BossTarget[],
): BossTarget | undefined {
  let best: BossTarget | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const distance = Math.hypot(target.position.x - from.x, target.position.z - from.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  return best;
}

export interface ZoneContext {
  readonly aim: AttackAim;
  /** 技が始まってからの経過ミリ秒。予兆の開始を 0 とする。 */
  readonly elapsedMs: number;
  readonly targets: readonly BossTarget[];
}

/**
 * 今この瞬間の危険範囲を求める。
 *
 * 予兆中でも判定中でも同じ範囲を返す。予兆で見せた範囲と当たる範囲が
 * 違うと「予兆を見て回避する」が成立しないため
 * (Issue #58「危険範囲が視覚的に読める」)。
 */
export function dangerZonesOf(attackId: HoriAttackId, context: ZoneContext): DangerZone[] {
  const spec = DEFAULT_HORI_ATTACKS[attackId];
  const { aim, elapsedMs, targets } = context;

  switch (attackId) {
    case 'WAKE_UP_ALARM':
    case 'MORNING_DASH': {
      return [{ origin: aim.origin, shape: spec.shape, rotationY: aim.rotationY }];
    }

    case 'COMPRESSION_FIELD': {
      return aim.points.map((point) => ({
        origin: point,
        shape: spec.shape,
        rotationY: 0,
      }));
    }

    default: {
      // BLUE_LIGHT。
      const start = aim.points[0];
      if (start === undefined) return [];
      const target = targets.find((candidate) => candidate.id === aim.targetId);
      if (target === undefined) {
        return [{ origin: start, shape: spec.shape, rotationY: 0 }];
      }
      // 開始点から対象へ向かって、追尾速度の上限まで詰める。
      // 走って距離を稼いだ分だけ着弾点は置き去りになる。
      const toTarget = {
        forward: start.z - target.position.z,
        right: target.position.x - start.x,
      };
      const distance = Math.hypot(toTarget.forward, toTarget.right);
      const travelled = (BLUE_LIGHT_TRACKING_SPEED * elapsedMs) / 1000;
      const origin =
        travelled >= distance
          ? target.position
          : moveCharacter({
              position: start,
              input: toTarget,
              speed: BLUE_LIGHT_TRACKING_SPEED,
              delta: elapsedMs / 1000,
            });
      return [{ origin, shape: spec.shape, rotationY: 0 }];
    }
  }
}
