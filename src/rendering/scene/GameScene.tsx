import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import { readPresentationSettings } from '@/presentation/presentation-store';

import { BossMesh } from '../boss/BossMesh';
import { PlayerMesh } from '../player/PlayerMesh';
import { VfxScene } from '../vfx/VfxScene';

/**
 * Phase 1 の最小3D Scene。
 * 2.5D固定カメラ型を想定しているため、Camera は原則固定とする。
 * OrbitControls は Graybox 確認用で、本実装で外してよい。
 * (docs/technical-design.md §3.1)
 */
export function GameScene(): React.JSX.Element {
  return (
    <Canvas shadows camera={{ position: [0, 2.5, 8], fov: 50 }}>
      <color attach="background" args={['#14121f']} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow />

      {/*
        カメラシェイクはシーンの中身を包んだ group を動かして表現する。
        OrbitControls が毎フレーム camera を上書きするため、camera 自体を
        揺らしても打ち消される。
      */}
      <VfxScene getSettings={readPresentationSettings}>
        <BossMesh />
        <PlayerMesh />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[24, 24]} />
          <meshStandardMaterial color="#241f33" />
        </mesh>
      </VfxScene>

      <OrbitControls enablePan={false} />
    </Canvas>
  );
}
