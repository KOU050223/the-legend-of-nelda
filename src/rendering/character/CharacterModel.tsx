import { useEffect, useRef } from 'react';
import { Clone, useAnimations, useGLTF } from '@react-three/drei';
import type { Group } from 'three';

import type { CharacterId } from '@/game/config/phase2-player-balance';

import { CHARACTER_DISPLAY_HEIGHT, CHARACTER_MODELS } from './character-models';
import { disableSkinnedCulling } from './disableSkinnedCulling';

export interface CharacterModelProps {
  /** どの大輔を描くか。GLBとスケールは CHARACTER_MODELS が持つ。 */
  characterId: CharacterId;
}

/**
 * キャラクターの見た目を担当する境界 (Issue #79 でGLBへ差し替え)。
 *
 * GLB表示・animation・scale調整・model orientation調整はここへ閉じ込める。
 * position / rotation の制御は親の Character Root (PlayerCharacter) が持ち、
 * ここでは受け取らない。
 *
 * GLBの読み込みは suspend するため、呼び出し側は Suspense で受け止める。
 * 受け止めないと読み込みの間 Canvas の中身が丸ごと消える (ボスと同じ理由)。
 */
export function CharacterModel({ characterId }: CharacterModelProps): React.JSX.Element {
  const { url, standingHeight, clip } = CHARACTER_MODELS[characterId];
  const { scene, animations } = useGLTF(url);
  const root = useRef<Group>(null);
  const { actions } = useAnimations(animations, root);

  useEffect(() => {
    // クリップは添字ではなく名前で引く。GLB内の並び順はエクスポータ依存で、
    // クリップが増減すると添字が意味を失うため (assets/AGENTS.md)。
    // スタープラチナのようにクリップを持たないモデルは静止したまま描く。
    if (clip === null) return undefined;

    const action = actions[clip];
    if (!action) {
      console.warn(`[CharacterModel] クリップ ${clip} が ${url} にない`);
      return undefined;
    }

    action.reset().play();

    return () => {
      action.stop();
    };
  }, [actions, clip, url]);

  return (
    // GLBの正面は +Z で assets/AGENTS.md の規約どおり。一方ゲーム内の向きは
    // rotationY = 0 が -Z 向き (game/movement の facingRotationY)。この 180° は
    // モデル個別のズレ補正ではなく、GLBの規約とゲームの向きの規約を繋ぐもので、
    // 3体に同じ値が当たる。モデルが増えても補正は散らばらない。
    // (ボスは入力で向きを変えないため、この補正を持たない)
    <group ref={root} rotation={[0, Math.PI, 0]} scale={CHARACTER_DISPLAY_HEIGHT / standingHeight}>
      <Clone object={scene} castShadow ref={disableSkinnedCulling} />
    </group>
  );
}
