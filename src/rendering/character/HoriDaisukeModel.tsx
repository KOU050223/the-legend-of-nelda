import { useEffect, useRef } from 'react';
import { Clone, useAnimations, useGLTF } from '@react-three/drei';
import { LoopOnce, LoopRepeat, type AnimationAction, type Group } from 'three';

import {
  DEFAULT_MOTION,
  MOTION_CLIPS,
  MOTION_FADE_SECONDS,
  type HoriDaisukeMotion,
} from './horiDaisukeMotions';
import { disableSkinnedCulling } from './disableSkinnedCulling';

/** FBX群から合成したGLB。`scripts/build-hori-daisuke-glb.py` で生成する。 */
const MODEL_URL = '/models/hori-daisuke.glb';

/**
 * GLB内で立ち上がった状態の高さ (Blenderで実測, unit)。
 * 既存のグレーボックスBoss (高さ2.4) と同じ見た目スケールへ揃えるために使う。
 */
const MODEL_STANDING_HEIGHT = 0.762;

/** 既存のグレーボックスBossに合わせた表示上の高さ。 */
const DISPLAY_HEIGHT = 2.4;

type Props = {
  /** 再生するクリップ。既定は登場演出の `stand-up`。 */
  readonly motion?: HoriDaisukeMotion;
};

/**
 * クリップの定義に従って再生を始める。
 *
 * 切り替えは fadeIn と、前のクリップ側の cleanup が呼ぶ fadeOut の組で繋ぐ。
 * `crossFadeFrom` は既に fadeOut 済みのアクションを起点にすると新クリップの
 * weight が上がってこないことがあるため使わない。
 */
function play(action: AnimationAction, motion: HoriDaisukeMotion): void {
  const { loop } = MOTION_CLIPS[motion];

  action.reset();
  action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
  action.fadeIn(MOTION_FADE_SECONDS).play();
}

/**
 * Boss「堀大輔」のGLBモデル。
 *
 * GLBはリグ付きモデル1体と、Mixamoから Without Skin で落とした複数の
 * モーションを1ファイルにまとめたもの。どのクリップを再生するかは `motion` が
 * 決め、切り替え時はフェードで繋ぐ。
 *
 * 再生の進行は表示層だけが持ち、戦闘の当たり判定はアニメーションフレームに
 * 依存させない (docs/technical-design.md §13)。ループしないクリップを頭から
 * 再生し直すときは、親が `key` を変えて作り直す。表示層に再生用のトークンを
 * 持たせず、Effectへ余分な依存を足さないため。
 */
export function HoriDaisukeModel({ motion = DEFAULT_MOTION }: Props = {}): React.JSX.Element {
  const { scene, animations } = useGLTF(MODEL_URL);
  const root = useRef<Group>(null);
  const { actions } = useAnimations(animations, root);

  /** 前のクリップを止めるタイマー。次の再生が始まったら取り消す。 */
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const action = actions[motion];
    if (!action) {
      console.warn(`[HoriDaisukeModel] クリップ ${motion} が ${MODEL_URL} にない`);
      return undefined;
    }

    // 前のクリップのフェードアウト待ちが残っていると、StrictModeの再マウントで
    // これから再生するアクションまで止めてしまう。再生前に必ず取り消す。
    clearTimeout(stopTimer.current);
    play(action, motion);

    return () => {
      // `clampWhenFinished` で最終フレームに留まったアクションは weight を保った
      // まま残り、fadeOut だけでは次のクリップと混ざって前の姿勢が抜けない。
      // フェードの見た目は残しつつ、フェード時間の経過後に確実に停止させる。
      action.fadeOut(MOTION_FADE_SECONDS);
      stopTimer.current = setTimeout(() => action.stop(), MOTION_FADE_SECONDS * 1000);
    };
  }, [actions, motion]);

  return (
    <group ref={root} scale={DISPLAY_HEIGHT / MODEL_STANDING_HEIGHT}>
      <Clone object={scene} castShadow ref={disableSkinnedCulling} />
    </group>
  );
}
