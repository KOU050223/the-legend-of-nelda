import type { DangerShape } from '../../config/phase2-boss-balance';
import type { PlanarPosition } from '../../movement/types';

/**
 * 展開中の危険範囲。判定と描画が共有する唯一の値。
 *
 * `origin` は形の基準点。RING はボスの中心、LINE は突進の始点、
 * CIRCLE は着弾点そのもの。`rotationY` は LINE の向きにだけ意味がある。
 */
export interface DangerZone {
  readonly origin: PlanarPosition;
  readonly shape: DangerShape;
  /** LINE の伸びる方向 (ラジアン)。他の形では無視される。 */
  readonly rotationY: number;
}

/** 点が危険範囲の内側にあるか。境界上は「内側」として扱う。 */
export function isInsideDangerZone(zone: DangerZone, point: PlanarPosition): boolean {
  const dx = point.x - zone.origin.x;
  const dz = point.z - zone.origin.z;

  const { shape } = zone;

  if (shape.kind === 'RING') {
    const distance = Math.hypot(dx, dz);
    return distance >= shape.innerRadius && distance <= shape.outerRadius;
  }

  if (shape.kind === 'CIRCLE') {
    return Math.hypot(dx, dz) <= shape.radius;
  }

  {
    // 突進方向へ回した座標系で、矩形の内外を見る。
    // facingRotationY と同じく rotationY = 0 が -Z を向く。
    const forwardX = -Math.sin(zone.rotationY);
    const forwardZ = -Math.cos(zone.rotationY);
    // 進行方向への射影が矩形の長さの内側か。
    const along = dx * forwardX + dz * forwardZ;
    if (along < 0 || along > shape.length) return false;
    // 進行方向と直交する向きへの射影が幅の内側か。
    const across = dx * forwardZ - dz * forwardX;
    return Math.abs(across) <= shape.halfWidth;
  }
}
