import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { useGameStore } from '@/store/game-store';
import { RESULT_TIMING } from '@/ui/result/result-presentation';

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
  const defeatRotation = useRef<number | null>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      const result = useGameStore.getState().result;
      if (!result) {
        // 通常戦闘では既存VFXのヒットストップと演出強度を反映する。
        const { active } = useVfxStore.getState();
        const scale = visualScale(readPresentationSettings());
        meshRef.current.rotation.y += hitStopDelta(delta, active, performance.now(), scale) * 0.4;
        return;
      }
      if (result.outcome !== 'victory') return;
      defeatRotation.current ??= meshRef.current.rotation.y % (Math.PI * 2);
      if (result.elapsedMs <= RESULT_TIMING.hitStop) return;
      const t = Math.max(
        0,
        Math.min(1, (result.elapsedMs - RESULT_TIMING.hitStop) / RESULT_TIMING.reaction),
      );
      meshRef.current.position.set(0, 1.2 + Math.sin(t * Math.PI) * 2.8 - t * 0.35, -t * 3);
      meshRef.current.rotation.set(
        -t * Math.PI * 1.5,
        defeatRotation.current * (1 - t) + t * Math.PI * 4,
        t * 0.25,
      );
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 1.2, 0]} castShadow>
      <boxGeometry args={[1.6, 2.4, 1.6]} />
      <meshStandardMaterial color="#6b4fa0" />
    </mesh>
  );
}
