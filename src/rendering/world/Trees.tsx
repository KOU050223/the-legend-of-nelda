import { useLayoutEffect, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';

import { propRingLayout, TREE_RING, type PropPlacement } from './stage-layout';

const TRUNK_COLOR = '#4a3524';
const LEAVES_COLOR = '#2f6b3a';

/**
 * 岩の壁のさらに外側へ置く遠景の木立。
 *
 * アリーナの内側には置かない。当たり判定を持たない木をプレイ可能範囲へ置くと
 * 中を素通りできてしまい、境界が壁として読めなくなるため (Issue #54)。
 * アリーナ内部のランドマーク (＝移動している実感を出す視差の元) は、
 * 装置・安全地帯・祭壇のマーカー (`ArenaMarkers`) が担う。
 */
const PLACEMENTS: PropPlacement[] = propRingLayout({ count: 40, ...TREE_RING, seed: 1 });

const dummy = new Object3D();

/**
 * 木立。instancedMesh で幹と葉を1回ずつの draw call にまとめる
 * (Three.js コンポーネントのみで軽量に保つための構成)。
 *
 * 配置は `propRingLayout` による決定論的な計算結果を使う。毎フレーム
 * 位置を更新する必要が無いので、マウント時に一度だけ行列を設定する。
 */
export function Trees(): React.JSX.Element {
  const trunkRef = useRef<InstancedMesh>(null);
  const leavesRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const leaves = leavesRef.current;
    if (!trunk || !leaves) return;

    PLACEMENTS.forEach((placement, index) => {
      const trunkHeight = 1.6 * placement.scale;
      dummy.position.set(placement.x, trunkHeight / 2, placement.z);
      dummy.rotation.set(0, placement.rotationY, 0);
      dummy.scale.setScalar(placement.scale);
      dummy.updateMatrix();
      trunk.setMatrixAt(index, dummy.matrix);

      const leavesHeight = 2.2 * placement.scale;
      dummy.position.set(placement.x, trunkHeight + leavesHeight / 2 - 0.2, placement.z);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
    });

    trunk.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, PLACEMENTS.length]} receiveShadow>
        <cylinderGeometry args={[0.12, 0.16, 1.6, 6]} />
        <meshStandardMaterial color={TRUNK_COLOR} />
      </instancedMesh>
      <instancedMesh ref={leavesRef} args={[undefined, undefined, PLACEMENTS.length]} receiveShadow>
        <coneGeometry args={[1.1, 2.2, 7]} />
        <meshStandardMaterial color={LEAVES_COLOR} />
      </instancedMesh>
    </>
  );
}
