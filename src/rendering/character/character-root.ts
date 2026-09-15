import type { Group } from 'three';

import type { PlayerSnapshot } from '@/game/player/player-state';

/**
 * バーを含むプレイヤー表示のルートへ、最新のゲーム座標を反映する。
 *
 * CharacterActor と同じファイルに置くと Fast Refresh が
 * コンポーネント以外の export を理由に状態を保てなくなるため、
 * React を含まないこの関数だけを分けている。
 */
export function syncCharacterRoot(
  root: Group,
  player: Pick<PlayerSnapshot, 'position' | 'rotationY'>,
): void {
  root.position.set(player.position.x, 0, player.position.z);
  root.rotation.set(0, player.rotationY, 0);
}
