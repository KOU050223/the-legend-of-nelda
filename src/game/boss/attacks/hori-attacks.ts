import {
  BLUE_LIGHT_TRACKING_SPEED,
  COMPRESSION_FIELD_ANGLE_JITTER,
  COMPRESSION_FIELD_RING,
  COMPRESSION_FIELD_ZONE_COUNT,
  DEFAULT_HORI_ATTACKS,
  type HoriAttackId,
} from '../../config/phase2-boss-balance';
import { distanceToBounds, moveCharacter, facingRotationY } from '../../movement/movement';
import type { PlanarPosition } from '../../movement/types';
import { ARENA_BOUNDS, SAFE_ZONE_ANCHORS, SAFE_ZONE_RADIUS } from '../../arena/arena';
import { pseudoRandom, ringLayout } from '../../arena/ring-layout';
import type { BossTarget } from '../boss-target';
import type { DangerShape } from '../../config/phase2-boss-balance';
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

/**
 * 安全地帯と危険区画のあいだに取る余白。
 *
 * ちょうど接する位置に置くと、安全地帯の縁に立ったプレイヤーが
 * `isInsideDangerZone` の「境界は内側」判定で被弾する。安全地帯の中に居れば
 * 安全、を成り立たせるための最小限の余白。
 */
export const SAFE_ZONE_CLEARANCE = 0.25;

/** 危険区画の中心が安全地帯の中心から取る距離。 */
const COMPRESSION_FIELD_MIN_DISTANCE = (() => {
  const { shape } = DEFAULT_HORI_ATTACKS.COMPRESSION_FIELD;
  return (shape.kind === 'CIRCLE' ? shape.radius : 0) + SAFE_ZONE_RADIUS + SAFE_ZONE_CLEARANCE;
})();

/** 角度を (-π, π] へ畳む。 */
function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** `from` から `to` までの角度差を (0, 2π] で返す。 */
function angleSpacing(from: number, to: number): number {
  const delta = (to - from) % (Math.PI * 2);
  return delta > 0 ? delta : delta + Math.PI * 2;
}

/**
 * 半径 `radius` の円周上で、この安全地帯が塞ぐ角度の半幅 (rad)。
 * 0 ならその半径ではどの角度に置いても当たらない。
 */
function blockedHalfAngle(radius: number, safe: PlanarPosition): number {
  const safeRadius = Math.hypot(safe.x, safe.z);
  if (radius === 0 || safeRadius === 0) {
    return Math.abs(radius - safeRadius) >= COMPRESSION_FIELD_MIN_DISTANCE ? 0 : Math.PI;
  }

  // 余弦定理。中心間距離が MIN_DISTANCE になる角度が弧の端。
  const cosine =
    (radius * radius + safeRadius * safeRadius - COMPRESSION_FIELD_MIN_DISTANCE ** 2) /
    (2 * radius * safeRadius);
  if (cosine >= 1) return 0;
  if (cosine <= -1) return Math.PI;
  return Math.acos(cosine);
}

/** 半径 `radius` の円周上に、どの安全地帯にも当たらない角度があるか。 */
function hasClearAngle(radius: number): boolean {
  const arcs = SAFE_ZONE_ANCHORS.map((safe) => ({
    center: Math.atan2(safe.z, safe.x),
    half: blockedHalfAngle(radius, safe),
  })).toSorted((a, b) => a.center - b.center);
  if (arcs.length === 0) return true;

  // 隣り合う弧のあいだに隙間が残っていれば、そこが安全な角度。
  for (const [index, arc] of arcs.entries()) {
    const next = arcs[(index + 1) % arcs.length];
    if (next === undefined) continue;
    if (angleSpacing(arc.center, next.center) - arc.half - next.half > 0) return true;
  }
  return false;
}

/**
 * 安全な角度が生まれる最小半径。安全地帯の配置と危険区画の半径だけで決まるので
 * 一度だけ求める。
 *
 * 塞ぐ角度の半幅は半径に対して単調減少するため二分探索でよい。**返すのは必ず
 * `high` 側**（安全が確認できた端）。この半径は安全な角度が点へ退化する境界で、
 * `low` 側や中点を返すと浮動小数点で「安全な角度が無い」側へ落ちうる。
 */
function findClearAngleMinRadius(): number {
  const { innerRadius, outerRadius } = COMPRESSION_FIELD_RING;
  if (hasClearAngle(innerRadius)) return innerRadius;

  // COMPRESSION_FIELD_RING は as const なのでリテラル型になる。探索で動かすため number にする。
  let low: number = innerRadius;
  let high: number = outerRadius;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (hasClearAngle(middle)) high = middle;
    else low = middle;
  }
  return high;
}

const CLEAR_ANGLE_MIN_RADIUS = findClearAngleMinRadius();

/**
 * 危険区画の候補を、安全地帯に重ならない位置へ寄せる。
 *
 * 半径の分布を保ちたいので、**半径はその半径に安全な角度が無いときだけ**最小限
 * 上げる。角度はその半径で塞がれていなければそのまま、塞がれていれば禁止された
 * 弧の近い方の端へ移す。安全地帯は 120度 間隔で弧は互いに交わらないため、
 * 端へ移せば他の安全地帯に対しても必ず安全になる (retry しない)。
 *
 * 候補を捨てて引き直さないのは、区画数が seed によって減ると避ける圧が
 * 変わってしまうため (docs/phase2-gameplay-spec.md §9.3)。
 */
function clearOfSafeZones(angle: number, radius: number): { angle: number; radius: number } {
  const placedRadius = Math.max(radius, CLEAR_ANGLE_MIN_RADIUS);

  const blocked = SAFE_ZONE_ANCHORS.map((safe) => ({
    center: Math.atan2(safe.z, safe.x),
    half: blockedHalfAngle(placedRadius, safe),
  })).find((arc) => arc.half > 0 && Math.abs(normalizeAngle(angle - arc.center)) < arc.half);

  if (blocked === undefined) return { angle, radius: placedRadius };

  const before = blocked.center - blocked.half;
  const after = blocked.center + blocked.half;
  const toBefore = Math.abs(normalizeAngle(angle - before));
  const toAfter = Math.abs(normalizeAngle(angle - after));
  return { angle: toBefore <= toAfter ? before : after, radius: placedRadius };
}

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
        //
        // 候補が #54 の安全地帯へ重なったときは、捨てずに寄せる。捨てると
        // 区画数が seed 次第で減り、§9.3「安全地帯へ移動する」の圧が変わる。
        points: ringLayout({
          count: COMPRESSION_FIELD_ZONE_COUNT,
          innerRadius: COMPRESSION_FIELD_RING.innerRadius,
          outerRadius: COMPRESSION_FIELD_RING.outerRadius,
          seed,
          angleJitter: COMPRESSION_FIELD_ANGLE_JITTER,
        }).map((point) => {
          const placed = clearOfSafeZones(point.angle, Math.hypot(point.x, point.z));
          return {
            x: Math.cos(placed.angle) * placed.radius,
            z: Math.sin(placed.angle) * placed.radius,
          };
        }),
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

/**
 * 突進が実際に進む距離。軌道の長さ (`maxLength`) をアリーナの境界で切る。
 *
 * ボスだけが境界を無視して進むと、プレイヤーが立てない場所へ抜けてしまい、
 * 硬直中に殴り返せなくなる (プレイヤーは `ARENA_BOUNDS` で止まる)。
 *
 * **予兆で見せる帯・当たり判定・ボスの移動が、この1つの値を使う。**
 * `aim` は予兆の開始時に固定されているので、いつ・何回呼んでも同じ値になり、
 * スナップショットから復元しても変わらない。
 */
export function dashLengthOf(aim: AttackAim, maxLength: number): number {
  return Math.min(maxLength, distanceToBounds(aim.origin, aim.rotationY, ARENA_BOUNDS));
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

/** スナップショットから危険区画を復元するために必要な攻撃状態だけ。 */
interface ActiveAttackForDangerZones {
  readonly attackId: HoriAttackId;
  readonly startedAt: number;
  readonly aim: AttackAim;
  readonly beamOrigin: PlanarPosition | null;
}

/**
 * スナップショット上の攻撃から、現在表示すべき危険区画を求める。
 *
 * `takenAt` と `startedAt` は同じゲームクロック上の値なので、クライアントの
 * 時計へ依存せず、サーバーから届いた状態だけで経過時間を再現できる。
 */
export function dangerZonesOfActiveAttack(
  activeAttack: ActiveAttackForDangerZones | null,
  targets: readonly BossTarget[],
  takenAt: number,
): DangerZone[] {
  if (activeAttack === null) return [];

  return dangerZonesOf(activeAttack.attackId, {
    aim: activeAttack.aim,
    elapsedMs: takenAt - activeAttack.startedAt,
    targets,
    ...(activeAttack.beamOrigin === null ? {} : { beamOrigin: activeAttack.beamOrigin }),
  });
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
    case 'WAKE_UP_ALARM': {
      return [
        { id: `${attackId}:0`, origin: aim.origin, shape: spec.shape, rotationY: aim.rotationY },
      ];
    }

    case 'MORNING_DASH': {
      // 帯はボスが実際に止まる位置までで切る。壁を突き抜けた帯を見せると、
      // そこへ逃げれば安全なのか判断できない。
      const shape: DangerShape =
        spec.shape.kind === 'LINE'
          ? { ...spec.shape, length: dashLengthOf(aim, spec.shape.length) }
          : spec.shape;
      return [{ id: `${attackId}:0`, origin: aim.origin, shape, rotationY: aim.rotationY }];
    }

    case 'COMPRESSION_FIELD': {
      return aim.points.map((point, index) => ({
        id: `${attackId}:${index}`,
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
        return [{ id: `${attackId}:0`, origin: start, shape: spec.shape, rotationY: 0 }];
      }

      return [
        {
          id: `${attackId}:0`,
          origin: advanceBeam(start, target.position, elapsedMs),
          shape: spec.shape,
          rotationY: 0,
        },
      ];
    }
  }
}
