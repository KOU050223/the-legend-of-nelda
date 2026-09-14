import { useRef } from 'react';
import type { Group } from 'three';

import { ARENA_BOUNDS, SPAWN_POINTS } from '@/game/arena/arena';
import type { MovementInput, PlanarPosition } from '@/game/movement/types';

import { GameCamera } from '../camera/GameCamera';
import { CharacterModel } from '../character/CharacterModel';
import { PlayerCharacter } from '../character/PlayerCharacter';
import { World } from '../world/World';

/**
 * 3人ぶんの見た目の色。役割の割り当て (誰がどれか) は #45 / #55 で決まるため、
 * ここではスポーン地点の並び順に色を当てるだけにする。
 */
const CHARACTER_COLORS = ['#e07a3f', '#3f8f5f', '#5f7fd0'] as const;

const [LEFT_SPAWN, PLAYER_SPAWN, RIGHT_SPAWN] = SPAWN_POINTS;

export interface WorldSceneProps {
  getInput: () => MovementInput;
}

/**
 * ボスアリーナのシーン (Issue #54)。
 *
 * 3人分のスポーン地点にキャラクターを立て、そのうち1体を入力で動かす。
 * 残り2体は位置の確認用で、動かす手段 (入力の多重化・通信) は #55 / #47 の担当。
 *
 * Combat向けの GameScene とは責務を分け、Player Character + Follow Camera +
 * World を組み合わせる。既存Combatの見た目・挙動には影響しない。
 */
export function WorldScene({ getInput }: WorldSceneProps): React.JSX.Element {
  const characterRoot = useRef<Group>(null);

  return (
    <>
      <World />
      <StandbyCharacter spawn={LEFT_SPAWN} color={CHARACTER_COLORS[0]} />
      <PlayerCharacter
        root={characterRoot}
        getInput={getInput}
        spawn={PLAYER_SPAWN}
        bounds={ARENA_BOUNDS}
        color={CHARACTER_COLORS[1]}
      />
      <StandbyCharacter spawn={RIGHT_SPAWN} color={CHARACTER_COLORS[2]} />
      <GameCamera mode="follow" followTarget={characterRoot} />
    </>
  );
}

/**
 * 動かないキャラクター。スポーン地点が3人分あることを確かめるために立てる。
 *
 * 位置を毎フレーム書き換えないので、`position` を宣言的に渡してよい
 * (動く側の PlayerCharacter が初期化時に一度だけ当てているのとは事情が違う)。
 */
function StandbyCharacter({
  spawn,
  color,
}: {
  spawn: PlanarPosition;
  color: string;
}): React.JSX.Element {
  return (
    <group position={[spawn.x, 0, spawn.z]}>
      <CharacterModel color={color} />
    </group>
  );
}
