import { findVfx, useVfxStore, type ActiveVfx } from './vfx-store';

/**
 * ヒットストップ中かどうか。
 *
 * 止めるのは**見た目の動きだけ**で、Game Logic の時間は止めない。
 * GameClock を止めると入力受付ウィンドウが後ろへずれて判定が変わってしまう
 * (docs/single-player-poc-spec.md §12 の受付幅は着弾時刻からの相対で決まる)。
 * 演出はモーションを数フレーム固定して「刺さった」感触を出すだけに留める。
 *
 * @param now 実時間 (ms)。演出の経過を測るためだけに使う。
 */
export function isHitStopped(now: number = performance.now()): boolean {
  return hitStopOf(useVfxStore.getState().active, now) !== null;
}

/** 走っているヒットストップ。終わっていれば null。 */
export function hitStopOf(active: readonly ActiveVfx[], now: number): ActiveVfx | null {
  const vfx = findVfx(active, 'HIT_STOP');
  if (!vfx) return null;

  return now - vfx.startedAt < vfx.durationMs ? vfx : null;
}

/**
 * ヒットストップを反映したフレーム時間。
 *
 * モーションの更新量に掛ける。止まっている間は 0 を返すので、
 * 呼び出し側は `delta` の代わりにこれを足すだけでよい。
 *
 * 強さ (strength) が小さいヒットストップは完全には止めず、動きを鈍らせる。
 * 回避成功の「軽いヒットストップ」と反撃成功の「強めのヒットストップ」を
 * 同じ仕組みで出し分けるため (Issue #11 実装対象)。
 *
 * @param scale 演出強度。ほかの演出と同じく設定が効く。0 で無効になり、
 *   絵を切っている間に走っていたヒットストップも即座に解ける。
 */
export function hitStopDelta(
  delta: number,
  active: readonly ActiveVfx[],
  now: number,
  scale = 1,
): number {
  if (scale <= 0) return delta;

  const vfx = hitStopOf(active, now);
  if (!vfx) return delta;

  return delta * Math.max(0, 1 - Math.min(1, vfx.strength * scale));
}
