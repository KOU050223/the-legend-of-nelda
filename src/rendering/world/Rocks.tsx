import { useLayoutEffect, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';

import { ringLayout, type PropPlacement } from './stage-layout';

const ROCK_COLOR = '#6b6559';

/**
 * 木立よりさらに外側に配置し、遠景の岩山のような縁を作る。
 * outerRadius は Ground (100x100、半径50) の縁からはみ出さないよう
 * 余白を残す (岩の見た目上の半径 ~1.6 を考慮)。
 */
const PLACEMENTS: PropPlacement[] = ringLayout({
  count: 20,
  innerRadius: 40,
  outerRadius: 46,
  seed: 7,
});

const dummy = new Object3D();

/**
 * 岩の群れ。見た目上の境界を示すランドマークで、当たり判定は持たない
 * (Issue #41 のスコープでは Collision/Physics を扱わない)。
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
