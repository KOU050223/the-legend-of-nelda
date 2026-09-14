import { Canvas } from '@react-three/fiber';

import { BossArenaScene } from '../boss/BossArenaScene';

/** ワールド探索モードと同じ空色。探索と戦闘で見た目を変えない。 */
const WORLD_BACKGROUND = '#8fc7e8';

/**
 * 堀大輔とのボス戦 (`?scene=boss`)。
 *
 * ワールドの草原の上で戦う。戦闘専用の別マップは作らない
 * (docs/phase2-gameplay-spec.md §2「1つの広めのボスマップ」)。
 * 地形そのもの (境界・スポーン地点・装置アンカー) は #54 のスコープ。
 */
export function BossScene(): React.JSX.Element {
  return (
    <Canvas shadows camera={{ position: [0, 4, 20], fov: 50 }}>
      <color attach="background" args={[WORLD_BACKGROUND]} />

      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 10, 4]} intensity={1.4} castShadow />

      <BossArenaScene />
    </Canvas>
  );
}
