import { DoubleSide } from 'three';

import {
  DEVICE_INTERACT_RANGE,
  type BarrierChallengeSnapshot,
} from '@/game/barrier/barrier-challenge';

/**
 * 結界の解除サークルを地面へ描く (Issue #143)。
 *
 * 半径は判定と同じ `DEVICE_INTERACT_RANGE` を読む。表示用に別の数を持つと
 * 「光っている円の中にいるのに入ったことにならない」が起きる
 * (DangerZoneMarks が判定用の形をそのまま受け取っているのと同じ理由)。
 *
 * 埋まっているかどうかは色の濃さで出す。文字を出さなくても
 * 「あと1つ空いている」が地面だけで読める。
 */

/**
 * 地面からの浮き。草 (Grass.tsx の高さ 0.4) より上へ出す。
 * 地面すれすれに置くと草に埋もれてサークルが読めない。
 */
const GROUND_OFFSET_Y = 0.45;

/** 空いているサークル。入ってほしいので、埋まっている側より目立たせる。 */
const IDLE_COLOR = '#8fd4ff';

/** 誰かが入っているサークル。達成済みなので落ち着いた緑にする。 */
const OCCUPIED_COLOR = '#7dffb0';

export interface BarrierCirclesProps {
  barrier: BarrierChallengeSnapshot | null;
}

export function BarrierCircles({ barrier }: BarrierCirclesProps): React.JSX.Element | null {
  if (barrier === null) return null;

  return (
    <>
      {barrier.devices.map((device) => {
        const occupied = device.status === 'OCCUPIED';
        return (
          <group key={device.id} position={[device.anchor.x, GROUND_OFFSET_Y, device.anchor.z]}>
            {/* 塗り。中に立つ場所そのもの。 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[DEVICE_INTERACT_RANGE, 48]} />
              <meshBasicMaterial
                color={occupied ? OCCUPIED_COLOR : IDLE_COLOR}
                transparent
                opacity={occupied ? 0.45 : 0.24}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* 縁。どこまでが円の中かを一目で切る。 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <ringGeometry args={[DEVICE_INTERACT_RANGE * 0.92, DEVICE_INTERACT_RANGE, 48]} />
              <meshBasicMaterial
                color={occupied ? OCCUPIED_COLOR : IDLE_COLOR}
                transparent
                opacity={occupied ? 0.95 : 0.7}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
