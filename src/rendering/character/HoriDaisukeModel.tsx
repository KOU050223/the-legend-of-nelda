import { useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { Group } from 'three';

import { MOTION_MODELS, resolveClip, type MotionContext } from './motion-manifest';
import { useMotionClip } from './useMotionClip';
import { cloneModelForScene, prepareClonedModel } from './cloned-model';

const MODEL = MOTION_MODELS['hori-daisuke'];

/** FBX群から合成したGLB。`scripts/build-hori-daisuke-glb.py` で生成する。 */
const MODEL_URL = MODEL.url;

/**
 * GLB内で立ち上がった状態の高さ (Blenderで実測, unit)。
 * 既存のグレーボックスBoss (高さ2.4) と同じ見た目スケールへ揃えるために使う。
 *
 * **`stand-up` の最終姿勢での高さ**なので、既定クリップを別のものへ変えると
 * 見た目の身長が変わる (assets/AGENTS.md)。マニフェストの `defaultClip` を
 * 動かすときはこの値も測り直す。
 */
const MODEL_STANDING_HEIGHT = MODEL.standingHeight;

/** 既存のグレーボックスBossに合わせた表示上の高さ。 */
export const DISPLAY_HEIGHT = 2.4;

/** 条件なし。毎レンダーで作り直すと参照が変わるので定数にする。 */
const NO_CONTEXT: MotionContext = {};

export type HoriDaisukeMotionProps = {
  /**
   * 再生するクリップを直接指定する。デバッグ画面のように、状態ではなく
   * 特定のクリップを見たい場合に使う。
   */
  readonly clip?: string;
  /**
   * 現在のゲーム状態。`clip` が無いときにマニフェストのルールで解決する。
   * ゲーム本体はこちらを渡す。
   */
  readonly context?: MotionContext;
};

/**
 * Boss「堀大輔」のGLBモデル。
 *
 * GLBはリグ付きモデル1体と、Mixamoから Without Skin で落とした複数の
 * モーションを1ファイルにまとめたもの。どのクリップを再生するかは
 * `assets/motion-manifest.json` のルールと `context` が決め、切り替え時は
 * フェードで繋ぐ。
 *
 * 再生の進行は表示層だけが持ち、戦闘の当たり判定はアニメーションフレームに
 * 依存させない (docs/technical-design.md §13)。ループしないクリップを頭から
 * 再生し直すときは、親が `key` を変えて作り直す。表示層に再生用のトークンを
 * 持たせず、Effectへ余分な依存を足さないため。
 */
export function HoriDaisukeModel({
  clip,
  context = NO_CONTEXT,
}: HoriDaisukeMotionProps = {}): React.JSX.Element {
  const { scene, animations } = useGLTF(MODEL_URL);
  const root = useRef<Group>(null);
  const { actions } = useAnimations(animations, root);
  // drei の <Clone> はボーンをシーングラフから外すため使わない。
  // <primitive> で複製を丸ごと入れる (cloned-model.ts の説明)。
  const model = useMemo(() => cloneModelForScene(scene), [scene]);

  useMotionClip(actions, MODEL, clip ?? resolveClip(MODEL, context));

  return (
    <group ref={root} scale={DISPLAY_HEIGHT / MODEL_STANDING_HEIGHT}>
      <primitive object={model} ref={prepareClonedModel} />
    </group>
  );
}
