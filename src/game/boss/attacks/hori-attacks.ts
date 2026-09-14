import {
  BLUE_LIGHT_TRACKING_SPEED,
  COMPRESSION_FIELD_ANGLE_JITTER,
  COMPRESSION_FIELD_RING,
  COMPRESSION_FIELD_ZONE_COUNT,
  DEFAULT_HORI_ATTACKS,
  type HoriAttackId,
} from '../../config/phase2-boss-balance';
import { moveCharacter, facingRotationY } from '../../movement/movement';
import type { PlanarPosition } from '../../movement/types';
import { pseudoRandom, ringLayout } from '../../arena/ring-layout';
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
        // 角度の揺らぎは #54 の装置配置 (等間隔) と違い、毎回同じ場所が
        // 安全にならないよう残す。seed が同じなら配置も同じで、
        // スナップショットから復元できる (Issue #58)。
        points: ringLayout({
          count: COMPRESSION_FIELD_ZONE_COUNT,
          innerRadius: COMPRESSION_FIELD_RING.innerRadius,
          outerRadius: COMPRESSION_FIELD_RING.outerRadius,
          seed,
          angleJitter: COMPRESSION_FIELD_ANGLE_JITTER,
        }).map(({ x, z }) => ({ x, z })),
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
  /**
   * 追尾ビームの現在の着弾点。BLUE_LIGHT でボスが持っている値を渡す。
   *
   * 省略すると開始点から経過時間ぶんを引き直すが、それだと相手が横へ
   * 走ったときに着弾点が追尾速度を超えて横滑りする。
   */
  readonly beamOrigin?: PlanarPosition;
}

/**
 * 追尾ビームの着弾点を、前の位置から1フレームぶん進める。
 *
 * 速度に上限があるので、走って距離を稼げば振り切れる (§9.2「走って逃げる」)。
 * 経過時間から毎回引き直すのではなく前の位置から積むのは、そうしないと
 * 相手が横へ動いた分だけ上限を超えて近づいてしまうため。
 */
export function advanceBeam(
  from: PlanarPosition,
  target: PlanarPosition,
  deltaMs: number,
): PlanarPosition {
  const toTarget = { forward: from.z - target.z, right: target.x - from.x };
  const distance = Math.hypot(toTarget.forward, toTarget.right);
  const travelled = (BLUE_LIGHT_TRACKING_SPEED * deltaMs) / 1000;

  if (travelled >= distance) return target;

  return moveCharacter({
    position: from,
    input: toTarget,
    speed: BLUE_LIGHT_TRACKING_SPEED,
    delta: deltaMs / 1000,
  });
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
      // BLUE_LIGHT。着弾点はボスが状態として持っている (beamOrigin)。
      // 渡されない場合だけ、開始点から経過時間ぶんを引く。
      const start = context.beamOrigin ?? aim.points[0];
      if (start === undefined) return [];

      const target = targets.find((candidate) => candidate.id === aim.targetId);
      if (target === undefined || context.beamOrigin !== undefined) {
        return [{ origin: start, shape: spec.shape, rotationY: 0 }];
      }

      return [
        { origin: advanceBeam(start, target.position, elapsedMs), shape: spec.shape, rotationY: 0 },
      ];
    }
  }
}
