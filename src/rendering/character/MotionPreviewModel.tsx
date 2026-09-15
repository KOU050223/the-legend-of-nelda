import { useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { Group } from 'three';

import type { MotionModel } from './motion-manifest';
import { useMotionClip } from './useMotionClip';
import { cloneModelForScene, prepareClonedModel } from './cloned-model';

/** プレビューでの表示上の高さ。モデル間で見た目の大きさを揃える。 */
const PREVIEW_HEIGHT = 1.8;

export interface MotionPreviewModelProps {
  readonly model: MotionModel;
  /** 再生するクリップ名。 */
  readonly clip: string;
}

/**
 * マニフェストのどのモデルでも同じ扱いで描くプレビュー用コンポーネント。
 *
 * ゲーム本体の `HoriDaisukeModel` / `CharacterModel` は、それぞれボス用の
 * 表示高さや向きの補正を持つ。確認画面ではモデルを横並びに見比べたいので、
 * 補正を挟まず高さだけ揃えるこちらを使う。
 */
export function MotionPreviewModel({ model, clip }: MotionPreviewModelProps): React.JSX.Element {
  const { scene, animations } = useGLTF(model.url);
  const root = useRef<Group>(null);
  const { actions } = useAnimations(animations, root);
  const object = useMemo(() => cloneModelForScene(scene), [scene]);

  useMotionClip(actions, model, clip);

  return (
    <group ref={root} scale={PREVIEW_HEIGHT / model.standingHeight}>
      <primitive object={object} ref={prepareClonedModel} />
    </group>
  );
}
