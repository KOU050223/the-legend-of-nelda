import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

import { useGameStore } from '@/store/game-store';

import { NavieFairy } from './NavieFairy';

/** プレイヤーの周りを漂う、チュートリアル専用のナビ妖精。 */
export function TutorialFairy(): React.JSX.Element {
  const root = useRef<Group>(null);
  const phase = useRef(0);

  useFrame((_, delta) => {
    phase.current += delta;
    if (!root.current) return;

    const visible = useGameStore.getState().assistVisible;
    root.current.visible = visible;
    if (!visible) return;

    const t = phase.current;
    root.current.position.set(
      Math.cos(t * 0.75) * 0.7,
      1.55 + Math.sin(t * 1.5) * 0.18,
      3.5 + Math.sin(t * 0.75) * 0.35,
    );
    root.current.rotation.y = Math.sin(t * 0.75) * 0.35;
  });

  return (
    <group ref={root} visible={false}>
      <NavieFairy />
    </group>
  );
}
