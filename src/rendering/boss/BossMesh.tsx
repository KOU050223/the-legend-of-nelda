import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

import { readPresentationSettings } from '@/presentation/presentation-store';
import { visualScale } from '@/presentation/presentation-settings';

import { hitStopDelta } from '../vfx/hit-stop';
import { useVfxStore } from '../vfx/vfx-store';

/**
 * 仮Boss。Graybox First のため Primitive Mesh で表現する。
 * (docs/development-workflow.md §9 / docs/technical-design.md §12)
 */
export function BossMesh(): React.JSX.Element {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // ヒットストップ中はモーションを止める。止めるのは見た目だけで、
    // Game Logic の時間は動き続ける (hit-stop.ts)。
    const { active } = useVfxStore.getState();
    const scale = visualScale(readPresentationSettings());
    meshRef.current.rotation.y += hitStopDelta(delta, active, performance.now(), scale) * 0.4;
  });

  return (
    <mesh ref={meshRef} position={[0, 1.2, 0]} castShadow>
      <boxGeometry args={[1.6, 2.4, 1.6]} />
      <meshStandardMaterial color="#6b4fa0" />
    </mesh>
  );
}
