import { useLayoutEffect, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';

import { propRingLayout, ROCK_RING, type PropPlacement } from './stage-layout';

const ROCK_COLOR = '#6b6559';

/**
 * プレイ可能範囲のすぐ外側を取り囲む岩の壁。
 *
 * 移動は `ARENA_BOUNDS` でクランプされるため当たり判定は持たないが、
 * 「どこで止まるか」を見た目で伝えるのはこの岩の帯の役目。数を多くして
 * 隙間を詰め、縁ではなく壁として読めるようにする。
 */
const PLACEMENTS: PropPlacement[] = propRingLayout({
  count: 96,
  ...ROCK_RING,
  seed: 7,
});

const dummy = new Object3D();

/**
 * 岩の群れ。アリーナの境界を示すランドマーク。
 * 当たり判定は持たず、移動の制限は `moveCharacter` の `bounds` が担う
 * (Issue #54)。
 *
 * instancedMesh 1つ・1 draw call で構成し、軽量に保つ。
 */
export function Rocks(): React.JSX.Element {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    PLACEMENTS.forEach((placement, index) => {
      dummy.position.set(placement.x, 0.6 * placement.scale, placement.z);
      dummy.rotation.set(placement.rotationY * 0.4, placement.rotationY, placement.rotationY * 0.6);
      dummy.scale.setScalar(placement.scale * 1.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PLACEMENTS.length]} receiveShadow>
      <dodecahedronGeometry args={[0.9, 0]} />
      <meshStandardMaterial color={ROCK_COLOR} flatShading />
    </instancedMesh>
  );
}
