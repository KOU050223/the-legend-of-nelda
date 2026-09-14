import { Canvas } from '@react-three/fiber';
import { ResultCamera } from '../result/ResultCamera';

import { BossMesh } from '../boss/BossMesh';
import { PlayerMesh } from '../player/PlayerMesh';

/**
 * Phase 1 の最小3D Scene。
 * 2.5D固定カメラ型を想定しているため、Camera は原則固定とする。
 * 決着時のみ ResultCamera が固定位置から演出する。
 * (docs/technical-design.md §3.1)
 */
export function GameScene(): React.JSX.Element {
  return (
    <Canvas shadows camera={{ position: [0, 2.5, 8], fov: 50 }}>
      <color attach="background" args={['#14121f']} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow />

      <BossMesh />
      <PlayerMesh />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#241f33" />
      </mesh>

      <ResultCamera />
    </Canvas>
  );
}
