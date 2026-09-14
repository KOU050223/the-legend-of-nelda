import { DoubleSide } from 'three';

import type { DangerZone } from '@/game/boss/attacks/danger-zone';

import { lineMarkRotation } from './danger-zone-geometry';

/**
 * ボスの危険範囲を地面へ描く。
 *
 * 判定に使っている `DangerZone` をそのまま受け取る。判定用の形と表示用の形を
 * 別々に持つと、演出の調整でずれて「見えていた範囲の外で当たる」が起きる
 * (Issue #58「危険範囲が視覚的に読める（B級演出でも情報は潰さない）」)。
 *
 * Graybox First。色と不透明度だけで読ませ、パーティクルは載せない
 * (docs/development-workflow.md §9)。
 */

/**
 * 地面からの浮き。
 *
 * 草 (`Grass.tsx` の高さ 0.4) より上へ出す。地面すれすれに置くと草に
 * 埋もれて危険範囲が読めない。Z-fighting を避けるだけの値では足りない。
 */
const GROUND_OFFSET_Y = 0.45;

export interface DangerZoneMarksProps {
  zones: readonly DangerZone[];
  /**
   * 予兆中か。予兆は薄く、判定中は濃くする。濃さだけで段階が分かるので、
   * 技名表示が出ていなくても「今当たる」が読める。
   */
  imminent?: boolean;
}

export function DangerZoneMarks({
  zones,
  imminent = false,
}: DangerZoneMarksProps): React.JSX.Element {
  // 草原の緑の上に載るので、緑から最も離れた色を選ぶ。橙を薄く敷くと
  // 地面の緑と明度が近く、危険範囲だと気づけない
  // (#58「B級演出でも情報は潰さない」)。
  //
  // 予兆は紫寄りの赤、判定中は純度の高い赤。色相ではなく明度と彩度で
  // 段階を付けているので、色覚特性によらず「濃くなった」が読める。
  const opacity = imminent ? 0.8 : 0.55;
  const color = imminent ? '#ff1a1a' : '#c2185b';

  return (
    <>
      {/*
        key は判定側が持つ `zone.id`。座標からキーを作ると、追尾する技
        (ブルーライト照射) では着弾点が毎フレーム動くぶんキーも変わり、
        React が毎フレーム別物とみなして mesh を作り直す。
      */}
      {zones.map((zone) => (
        <DangerZoneMark key={zone.id} zone={zone} color={color} opacity={opacity} />
      ))}
    </>
  );
}

interface DangerZoneMarkProps {
  zone: DangerZone;
  color: string;
  opacity: number;
}

function DangerZoneMark({ zone, color, opacity }: DangerZoneMarkProps): React.JSX.Element {
  const { origin, shape, rotationY } = zone;

  switch (shape.kind) {
    case 'RING': {
      return (
        <mesh position={[origin.x, GROUND_OFFSET_Y, origin.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[shape.innerRadius, shape.outerRadius, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      );
    }

    case 'CIRCLE': {
      return (
        <mesh position={[origin.x, GROUND_OFFSET_Y, origin.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[shape.radius, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      );
    }

    default: {
      // LINE。矩形は始点から伸びるので、中心を半分ずらす。
      // rotationY = 0 が -Z を向く規約 (facingRotationY と同じ)。
      const forwardX = -Math.sin(rotationY);
      const forwardZ = -Math.cos(rotationY);
      const centerX = origin.x + (forwardX * shape.length) / 2;
      const centerZ = origin.z + (forwardZ * shape.length) / 2;

      return (
        <mesh position={[centerX, GROUND_OFFSET_Y, centerZ]} rotation={lineMarkRotation(rotationY)}>
          <planeGeometry args={[shape.halfWidth * 2, shape.length]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      );
    }
  }
}
