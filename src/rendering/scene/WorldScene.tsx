import { useRef } from 'react';
import type { Group } from 'three';

import { GameCamera } from '../camera/GameCamera';
import { PlayerCharacter } from '../character/PlayerCharacter';
import { World } from '../world/World';
import type { MovementInput } from '@/game/movement/types';

export interface WorldSceneProps {
  getInput: () => MovementInput;
}

/**
 * ワールド探索モード。Character基盤 (Issue #41) の動作確認用シーン。
 *
 * Combat向けの GameScene とは責務を分け、Player Character + Follow Camera +
 * World を組み合わせる。既存Combatの見た目・挙動には影響しない。
 */
export function WorldScene({ getInput }: WorldSceneProps): React.JSX.Element {
  const characterRoot = useRef<Group>(null);

  return (
    <>
      <World />
      <PlayerCharacter root={characterRoot} getInput={getInput} />
      <GameCamera mode="follow" followTarget={characterRoot} />
    </>
  );
}
