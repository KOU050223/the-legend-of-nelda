import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { useGameStore } from '@/store/game-store';

/**
 * 仮Player。Graybox First のため Primitive Mesh で表現する。
 */
export function PlayerMesh(): React.JSX.Element {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const result = useGameStore.getState().result;
    if (!mesh.current || result?.outcome !== 'defeat') return;
    const t = Math.min(1, result.elapsedMs / 1400);
    const ease = t * t * (3 - 2 * t);
    mesh.current.rotation.z = (ease * Math.PI) / 2;
    mesh.current.position.set(-ease * 0.45, 0.6 - ease * 0.25, 3.5);
  });
  return (
    <mesh ref={mesh} position={[0, 0.6, 3.5]} castShadow>
      <capsuleGeometry args={[0.35, 0.7, 4, 12]} />
      <meshStandardMaterial color="#3f8f5f" />
    </mesh>
  );
}
