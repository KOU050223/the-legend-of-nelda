import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Group } from 'three';
import type { RefObject } from 'react';

/** Player位置からの相対オフセット。 */
const OFFSET = new Vector3(0, 4, 6);

/**
 * 追従の滑らかさ。1秒あたりにどれだけ desired へ寄せるかの割合
 * (大きいほど速く追従する)。フレームレートに依存させないよう、
 * 実際の補間係数は `1 - Math.exp(-FOLLOW_RATE * delta)` で毎フレーム
 * delta から計算する (r3f-require-frame-delta)。
 */
const FOLLOW_RATE = 3;

// useFrame のたびに new Vector3 しない (r3f-no-new-in-use-frame)。
// このコンポーネントの描画は1インスタンスのみなので使い回して問題ない。
const desired = new Vector3();

export interface FollowCameraProps {
  target: RefObject<Group | null>;
}

/**
 * Player位置 + offset を追従する最小Camera実装。
 *
 * `camera.position.lerp(...)` で滑らかに追従する (Issue #41)。
 */
export function FollowCamera({ target }: FollowCameraProps): null {
  useFrame(({ camera }, delta) => {
    const group = target.current;
    if (!group) return;

    desired.set(
      group.position.x + OFFSET.x,
      group.position.y + OFFSET.y,
      group.position.z + OFFSET.z,
    );
    const lerpFactor = 1 - Math.exp(-FOLLOW_RATE * delta);
    camera.position.lerp(desired, lerpFactor);
    camera.lookAt(group.position.x, group.position.y + 0.6, group.position.z);
  });

  return null;
}
