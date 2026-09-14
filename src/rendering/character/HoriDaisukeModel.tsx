import { useEffect, useRef } from 'react';
import { Clone, useAnimations, useGLTF } from '@react-three/drei';
import { LoopOnce, type AnimationAction, type Group } from 'three';

/** FBXから変換したGLB。`scripts/convert-hori-zombie-to-glb.py` で生成する。 */
const MODEL_URL = '/models/hori-daisuke.glb';

/**
 * GLB内で立ち上がった状態の高さ (Blenderで実測, unit)。
 * 既存のグレーボックスBoss (高さ2.4) と同じ見た目スケールへ揃えるために使う。
 */
const MODEL_STANDING_HEIGHT = 0.762;

/** 既存のグレーボックスBossに合わせた表示上の高さ。 */
const DISPLAY_HEIGHT = 2.4;

/** クリップを1回だけ再生し、最後のフレームで止める。 */
function playOnce(action: AnimationAction): void {
  action.reset();
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
}

/**
 * Boss「堀大輔」のGLBモデル。
 *
 * FBX同梱の Mixamo リグ + Zombie Stand Up アニメを1回だけ再生し、
 * 立ち上がった姿勢で停止する。再生の進行は表示層だけが持ち、戦闘の
 * 当たり判定はアニメーションフレームに依存させない
 * (docs/technical-design.md §13)。
 *
 * 再生し直すときは親が `key` を変えて作り直す。表示層に再生用の
 * トークンを持たせず、Effectへ余分な依存を足さないため。
 */
export function HoriDaisukeModel(): React.JSX.Element {
  const { scene, animations } = useGLTF(MODEL_URL);
  const root = useRef<Group>(null);
  const { actions, names } = useAnimations(animations, root);

  useEffect(() => {
    // 変換元FBXは Zombie Stand Up の1クリップだけを持つ。
    const name = names[0];
    const action = name === undefined ? undefined : actions[name];
    if (action) playOnce(action);

    return () => {
      action?.stop();
    };
  }, [actions, names]);

  return (
    <group ref={root} scale={DISPLAY_HEIGHT / MODEL_STANDING_HEIGHT}>
      <Clone object={scene} castShadow />
    </group>
  );
}
