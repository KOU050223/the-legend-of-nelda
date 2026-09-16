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

/**
 * 空いているサークル。
 *
 * 安全地帯 (ArenaMarkers の SafeZoneMark、水色 #9fd7ff・半径3.5) が同じ
 * アリーナに3つ出ており、水色で描くと見分けが付かない。実際に「入ったのに
 * 埋まらない」と読まれた (Issue #143 のフィードバック)。装置の頭
 * (DEVICE_TOP_COLOR #ffd166) と同じ琥珀にして、装置に属する円だと分かるようにする。
 */
const IDLE_COLOR = '#ffb020';

/** 誰かが入っているサークル。埋まったことを色で切り替える。 */
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
                opacity={occupied ? 0.5 : 0.42}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/*
              光の柱。装置は半径17に散っていて、円の塗りだけでは遠くから
              どこへ向かえばいいか読めない。柱は視線の高さにも掛かるので、
              アリーナのどこに居ても「あそこへ走る」が決まる。
            */}
            <mesh position={[0, 5, 0]}>
              <cylinderGeometry
                args={[DEVICE_INTERACT_RANGE * 0.62, DEVICE_INTERACT_RANGE * 0.62, 10, 24, 1, true]}
              />
              <meshBasicMaterial
                color={occupied ? OCCUPIED_COLOR : IDLE_COLOR}
                transparent
                opacity={occupied ? 0.2 : 0.16}
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
