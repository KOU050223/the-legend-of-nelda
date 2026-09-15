import { useEffect, useRef } from 'react';
import { LoopOnce, LoopRepeat, type AnimationAction } from 'three';

import { MOTION_FADE_SECONDS, type MotionModel } from './motion-manifest';

/** クリップ名から再生用のアクションを引く。drei の `useAnimations` が返す形。 */
export type MotionActions = Readonly<Record<string, AnimationAction | null>>;

/**
 * クリップの定義に従って再生を始める。
 *
 * AnimationAction は再生位置や weight を内側に持つ three 側の可変オブジェクト
 * で、再生とはそれを動かすこと。フックの引数のまま触るとReactの状態を書き換えて
 * いるように見えるので、受け取った1本だけを相手にする関数へ出しておく。
 */
function play(action: AnimationAction, loop: boolean): void {
  action.reset();
  action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
  action.fadeIn(MOTION_FADE_SECONDS).play();
}

/** フェードで送り出し、フェードが終わったら確実に止める。 */
function stop(action: AnimationAction): ReturnType<typeof setTimeout> {
  // `clampWhenFinished` で最終フレームに留まったアクションは weight を保った
  // まま残り、fadeOut だけでは次のクリップと混ざって前の姿勢が抜けない。
  // フェードの見た目は残しつつ、フェード時間の経過後に確実に停止させる。
  action.fadeOut(MOTION_FADE_SECONDS);
  return setTimeout(() => action.stop(), MOTION_FADE_SECONDS * 1000);
}

/**
 * クリップの再生と切り替えを引き受ける。
 *
 * これまでボス (`HoriDaisukeModel`) だけが持っていた再生ロジックを、
 * プレイヤー側の `CharacterModel` からも使えるように切り出したもの。
 * `CharacterModel` は `action.reset().play()` しか持たず、ループ設定も
 * フェードも無かったため、GUIから差し替えても繋ぎ目が飛んでいた。
 *
 * 切り替えは fadeIn と、前のクリップ側の cleanup が呼ぶ fadeOut の組で繋ぐ。
 * `crossFadeFrom` は既に fadeOut 済みのアクションを起点にすると新クリップの
 * weight が上がってこないことがあるため使わない。
 */
export function useMotionClip(actions: MotionActions, model: MotionModel, clip: string): void {
  /**
   * 停止待ちのアクションとそのタイマー。
   *
   * どのアクションを止めようとしているかまで持つ。タイマーだけを持って
   * 無条件に取り消すと、クリップを切り替えたときに**前のクリップ**の停止まで
   * 取り消してしまう。`clampWhenFinished` で最終フレームに留まったアクションは
   * fadeOut だけでは weight が抜けないので、止め損ねると前の姿勢が新しい
   * クリップへ混ざったまま残る (ラッシュを最後まで再生してから待機へ戻すと
   * 腕が上がったままになる)。
   */
  const pending = useRef<{ action: AnimationAction; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  useEffect(() => {
    const playback = model.clips[clip];
    const action = actions[clip];
    if (!playback || !action) {
      console.warn(`[useMotionClip] クリップ ${clip} が ${model.url} にない`);
      return undefined;
    }

    // これから再生するアクション自身の停止待ちだけを取り消す。StrictModeの
    // 再マウントで、再生し直した直後に前の cleanup のタイマーが発火して
    // 止めてしまうのを防ぐためのもので、それは同じアクションの場合にあたる。
    if (pending.current?.action === action) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }

    play(action, playback.loop);

    return () => {
      pending.current = { action, timer: stop(action) };
    };
  }, [actions, model, clip]);
}
