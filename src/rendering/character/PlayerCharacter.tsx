import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { RefObject } from 'react';

import { facingRotationY, moveCharacter } from '@/game/movement/movement';
import type { CircularBounds, MovementInput, PlanarPosition } from '@/game/movement/types';

import { CharacterModel } from './CharacterModel';

/** 1秒あたりの移動量。 */
const DEFAULT_SPEED = 4;

export interface PlayerCharacterProps {
  /** Character Root の参照。Camera など外部から position を参照するために公開する。 */
  root: RefObject<Group | null>;
  /** 現在の押下状態から MovementInput を取得する。 */
  getInput: () => MovementInput;
  /** スポーン地点。初期化時に一度だけ適用する。 */
  spawn: PlanarPosition;
  /** 移動できる範囲。アリーナの外へ出られないようにする。 */
  bounds: CircularBounds;
  /** 見た目の色。 */
  color: string;
  speed?: number;
}

/**
 * Character Root。position / rotation / movement を担当する。
 *
 * 見た目 (GLB表示・animation・scale・orientation) は CharacterModel へ委譲し、
 * ここでは持たない (Issue #41 の Character Component 設計)。
 *
 * Movement計算そのものは Pure TypeScript の moveCharacter/facingRotationY
 * (src/game/movement) へ切り出してあり、ここでは結果を Object3D へ
 * 反映するだけにする。
 */
export function PlayerCharacter({
  root,
  getInput,
  spawn,
  bounds,
  color,
  speed = DEFAULT_SPEED,
}: PlayerCharacterProps): React.JSX.Element {
  const spawned = useRef(false);

  // スポーン地点は初期化時に一度だけ当てる。position は毎フレーム useFrame が
  // 直接書き換えるため、再レンダーのたびに当て直すと移動した位置がスポーン地点へ
  // 巻き戻る。<group position={...}> で宣言的に渡さないのも同じ理由。
  useLayoutEffect(() => {
    const group = root.current;
    if (!group || spawned.current) return;

    spawned.current = true;
    group.position.set(spawn.x, 0, spawn.z);
  }, [root, spawn]);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;

    const input = getInput();

    const next = moveCharacter({
      position: { x: group.position.x, z: group.position.z },
      input,
      speed,
      delta,
      bounds,
    });
    group.position.setX(next.x);
    group.position.setZ(next.z);

    const rotationY = facingRotationY(input);
    if (rotationY !== null) {
      group.rotation.set(group.rotation.x, rotationY, group.rotation.z);
    }
  });

  return (
    <group ref={root}>
      <CharacterModel color={color} />
    </group>
  );
}
