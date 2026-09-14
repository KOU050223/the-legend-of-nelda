import { useLayoutEffect, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';

import { ringLayout, type PropPlacement } from './stage-layout';

const GRASS_COLOR = '#6fae3f';

/** 草むらの塊の数。1塊につき複数本の cone をまとめて生やす。 */
const CLUMPS: PropPlacement[] = ringLayout({
  count: 260,
  innerRadius: 0,
  outerRadius: 42,
  seed: 3,
});

/** 1塊あたりに生やす cone の本数と、塊内でのばらけ幅。 */
const BLADES_PER_CLUMP = 4;
const CLUMP_SPREAD = 0.35;

const dummy = new Object3D();

/**
 * 草むらの群れ。二等辺三角柱を束ねただけの薄い cone で表現する
 * Graybox 表現。地面の単調さを消し、Player の足元にも密度を出す。
 * 当たり判定は持たない。
 *
 * instancedMesh 1つ・1 draw call。塊ごとに複数本まとめて生やすことで
 * 「単独のトゲ」ではなく「草むら」に見せる。
 */
export function Grass(): React.JSX.Element {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let index = 0;
    for (const clump of CLUMPS) {
      for (let blade = 0; blade < BLADES_PER_CLUMP; blade += 1) {
        const offsetSeed = clump.x * 13.7 + clump.z * 7.3 + blade;
        const offsetX = Math.sin(offsetSeed) * 0.5 * CLUMP_SPREAD;
        const offsetZ = Math.cos(offsetSeed * 1.3) * 0.5 * CLUMP_SPREAD;
        const bladeScale = clump.scale * (0.8 + (blade % 3) * 0.15);
        const height = 0.4 * bladeScale;

        dummy.position.set(clump.x + offsetX, height / 2, clump.z + offsetZ);
        dummy.rotation.set(0, clump.rotationY + blade, 0);
        dummy.scale.set(bladeScale, bladeScale * 1.2, bladeScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CLUMPS.length * BLADES_PER_CLUMP]}>
      <coneGeometry args={[0.16, 0.4, 4]} />
      <meshStandardMaterial color={GRASS_COLOR} />
    </instancedMesh>
  );
}
