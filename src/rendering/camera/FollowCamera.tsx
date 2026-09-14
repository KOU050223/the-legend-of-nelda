import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Group } from 'three';
import type { RefObject } from 'react';

/** Player位置からの相対オフセット。既定はワールド探索用の近い視点。 */
const DEFAULT_OFFSET = new Vector3(0, 4, 6);

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
  /**
   * 追従位置のオフセット。
   *
   * ボス戦では既定より高く・遠くする。近い視点のままだと、絶対起床アラームの
   * 全方位リング (外径18) や突進の軌道 (長さ30) が視界へ収まらず、
   * 予兆を見て回避できない (Issue #58「危険範囲が視覚的に読める」)。
   */
  offset?: Vector3;
  /** 注視点の高さ。省略時はキャラの少し上。 */
  lookAtHeight?: number;
}

/**
 * Player位置 + offset を追従する最小Camera実装。
 *
 * `camera.position.lerp(...)` で滑らかに追従する (Issue #41)。
 */
export function FollowCamera({
  target,
  offset = DEFAULT_OFFSET,
  lookAtHeight = 0.6,
}: FollowCameraProps): null {
  useFrame(({ camera }, delta) => {
    const group = target.current;
    if (!group) return;

    desired.set(
      group.position.x + offset.x,
      group.position.y + offset.y,
      group.position.z + offset.z,
    );
    const lerpFactor = 1 - Math.exp(-FOLLOW_RATE * delta);
    camera.position.lerp(desired, lerpFactor);
    camera.lookAt(group.position.x, group.position.y + lookAtHeight, group.position.z);
  });

  return null;
}
