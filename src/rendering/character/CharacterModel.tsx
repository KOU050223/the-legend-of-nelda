import { useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { Group } from 'three';

import type { CharacterId } from '@/game/config/phase2-player-balance';

import { CHARACTER_DISPLAY_HEIGHT, motionModelForCharacter } from './character-models';
import { resolveClip, type MotionContext } from './motion-manifest';
import { useMotionClip } from './useMotionClip';
import { cloneModelForScene, prepareClonedModel } from './cloned-model';

/** 条件なし。毎レンダーで作り直すと参照が変わるので定数にする。 */
const NO_CONTEXT: MotionContext = {};

export interface CharacterModelProps {
  /** どの大輔を描くか。GLBとスケールは motion-manifest.json が持つ。 */
  characterId: CharacterId;
  /**
   * 現在のゲーム状態。マニフェストのルールで再生クリップを解決する。
   * 攻撃中に攻撃モーションへ差し替える、といった対応はここを通る。
   */
  context?: MotionContext;
  /** 状態を無視して特定のクリップを再生する。デバッグ画面用。 */
  clip?: string;
}

/**
 * キャラクターの見た目を担当する境界 (Issue #79 でGLBへ差し替え)。
 *
 * GLB表示・animation・scale調整・model orientation調整はここへ閉じ込める。
 * position / rotation の制御は親の Character Root (PlayerCharacter) が持ち、
 * ここでは受け取らない。
 *
 * クリップの選択と繋ぎは `useMotionClip` とマニフェストへ委ねる。ボスと同じ
 * 仕組みを通すので、ループ設定とクロスフェードがプレイヤー側にも効く。
 *
 * GLBの読み込みは suspend するため、呼び出し側は Suspense で受け止める。
 * 受け止めないと読み込みの間 Canvas の中身が丸ごと消える (ボスと同じ理由)。
 */
export function CharacterModel({
  characterId,
  context = NO_CONTEXT,
  clip,
}: CharacterModelProps): React.JSX.Element {
  const model = motionModelForCharacter(characterId);
  const { scene, animations } = useGLTF(model.url);
  const root = useRef<Group>(null);
  const { actions } = useAnimations(animations, root);
  // drei の <Clone> はボーンをシーングラフから外すため使わない。
  // <primitive> で複製を丸ごと入れる (cloned-model.ts の説明)。
  const object = useMemo(() => cloneModelForScene(scene), [scene]);

  useMotionClip(actions, model, clip ?? resolveClip(model, context));

  return (
    // GLBの正面は +Z で assets/AGENTS.md の規約どおり。一方ゲーム内の向きは
    // rotationY = 0 が -Z 向き (game/movement の facingRotationY)。この 180° は
    // モデル個別のズレ補正ではなく、GLBの規約とゲームの向きの規約を繋ぐもので、
    // 3体に同じ値が当たる。モデルが増えても補正は散らばらない。
    // (ボスは入力で向きを変えないため、この補正を持たない)
    <group
      ref={root}
      rotation={[0, Math.PI, 0]}
      scale={CHARACTER_DISPLAY_HEIGHT / model.standingHeight}
    >
      <primitive object={object} ref={prepareClonedModel} />
    </group>
  );
}
