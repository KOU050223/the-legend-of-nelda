import type { Group } from 'three';
import type { RefObject } from 'react';

import { ResultCamera } from '../result/ResultCamera';
import { FollowCamera } from './FollowCamera';

/**
 * 戦闘用固定Camera (+決着演出) と、将来のワールド探索用Followカメラを
 * 交換可能にする境界 (Issue #41)。
 *
 * combat: 既存Phase 1のBoss Battle。固定カメラを維持する。
 * follow: Player Characterを追従する。
 */
export type CameraMode = 'combat' | 'follow';

export interface GameCameraProps {
  mode: CameraMode;
  /** mode: 'follow' のとき追従する対象。 */
  followTarget?: RefObject<Group | null>;
}

export function GameCamera({ mode, followTarget }: GameCameraProps): React.JSX.Element | null {
  if (mode === 'follow' && followTarget) {
    return <FollowCamera target={followTarget} />;
  }

  return <ResultCamera />;
}
