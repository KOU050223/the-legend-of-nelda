import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Group } from 'three';
import type { RefObject } from 'react';

/** Player位置からの相対オフセット。 */
const OFFSET = new Vector3(0, 4, 6);

/** 追従の滑らかさ (1フレームあたりの補間係数)。 */
const LERP_FACTOR = 0.1;

export interface FollowCameraProps {
  target: RefObject<Group | null>;
}

/**
 * Player位置 + offset を追従する最小Camera実装。
 *
 * `camera.position.lerp(...)` で滑らかに追従する (Issue #41)。
 */
export function FollowCamera({ target }: FollowCameraProps): null {
  useFrame(({ camera }) => {
    const group = target.current;
    if (!group) return;

    const desired = new Vector3(
      group.position.x + OFFSET.x,
      group.position.y + OFFSET.y,
      group.position.z + OFFSET.z,
    );
    camera.position.lerp(desired, LERP_FACTOR);
    camera.lookAt(group.position.x, group.position.y + 0.6, group.position.z);
  });

  return null;
}
