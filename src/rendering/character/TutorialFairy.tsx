import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3, type Group } from 'three';
import type { RefObject } from 'react';

import { useGameStore } from '@/store/game-store';

import { NavieFairy } from './NavieFairy';

const DEFAULT_FALLBACK_POSITION: [number, number, number] = [0, 0, 0];

/** プレイヤーの周りを漂う、チュートリアル専用のナビ妖精。 */
export interface TutorialFairyProps {
  /** 指定した場合、妖精はこの Object3D を中心に漂う。 */
  anchor?: RefObject<Group | null>;
  /** 省略時は戦闘チュートリアルの表示状態に従う。 */
  visible?: boolean;
  /** 追従対象がまだ読み込み中のときに使う初期位置。 */
  fallbackPosition?: [number, number, number];
}

export function TutorialFairy({
  anchor,
  visible,
  fallbackPosition = DEFAULT_FALLBACK_POSITION,
}: TutorialFairyProps = {}): React.JSX.Element {
  const root = useRef<Group>(null);
  const phase = useRef(0);
  const anchorPosition = useRef(new Vector3());

  useFrame((_, delta) => {
    phase.current += delta;
    if (!root.current) return;

    const isVisible = visible ?? useGameStore.getState().assistVisible;
    root.current.visible = isVisible;
    if (!root.current.visible) return;

    const t = phase.current;
    let centerX = fallbackPosition[0];
    let centerY = fallbackPosition[1];
    let centerZ = fallbackPosition[2];
    if (anchor !== undefined && anchor.current !== null) {
      anchor.current.getWorldPosition(anchorPosition.current);
      centerX = anchorPosition.current.x;
      centerY = anchorPosition.current.y;
      centerZ = anchorPosition.current.z;
    }
    root.current.position.set(
      centerX + Math.cos(t * 0.75) * 0.7,
      centerY + 1.55 + Math.sin(t * 1.5) * 0.18,
      centerZ + (anchor === undefined ? 3.5 : Math.sin(t * 0.75) * 0.35),
    );
    root.current.rotation.y = Math.sin(t * 0.75) * 0.35;
  });

  return (
    <group ref={root} position={fallbackPosition} visible={false}>
      <NavieFairy />
    </group>
  );
}
