/**
 * Boss「堀大輔」のGLBが持つモーションクリップの定義。
 *
 * `public/models/hori-daisuke.glb` は `scripts/build-hori-daisuke-glb.py` が
 * ベースFBX (モデル + リグ + Zombie Stand Up) と Mixamo から Without Skin で
 * 落としたモーションFBX群から生成する。ここのキーはスクリプト側の MOTIONS が
 * 付けるクリップ名と1対1で対応する。片方だけ足すとズレるため、モーションを
 * 増やすときは必ず両方を更新する。
 *
 * クリップを名前で引くのは、GLB内の並び順がエクスポータ依存で、増減すると
 * 添字が意味を失うため。
 */

/** GLBに入っているクリップ名。 */
export type HoriDaisukeMotion = 'stand-up' | 'walk';

/** クリップの再生の仕方。 */
export type MotionPlayback = {
  /** ループ再生するか。false なら最終フレームで停止する。 */
  readonly loop: boolean;
};

export const MOTION_CLIPS: Readonly<Record<HoriDaisukeMotion, MotionPlayback>> = {
  /** 起き上がり。登場演出なので1回だけ再生して立ち姿で止める。 */
  'stand-up': { loop: false },
  /** 歩行。位置の移動は表示層の外が決めるため、その場歩きとして扱う。 */
  walk: { loop: true },
};

/** モーション未指定時のクリップ。登場演出をそのまま既定にする。 */
export const DEFAULT_MOTION: HoriDaisukeMotion = 'stand-up';

/** クリップ間を繋ぐクロスフェードの秒数。 */
export const MOTION_FADE_SECONDS = 0.25;
