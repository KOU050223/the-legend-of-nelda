import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

/**
 * 仮Boss。Graybox First のため Primitive Mesh で表現する。
 * (docs/development-workflow.md §9 / docs/technical-design.md §12)
 */
export function BossMesh(): React.JSX.Element {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 1.2, 0]} castShadow>
      <boxGeometry args={[1.6, 2.4, 1.6]} />
      <meshStandardMaterial color="#6b4fa0" />
    </mesh>
  );
}
