import { useEffect, useState } from 'react';

import {
  DEFAULT_PRESENTATION_SETTINGS,
  visualScale,
  type PresentationSettings,
} from '@/presentation/presentation-settings';

import { findVfx, useVfxStore, vfxProgress, type ActiveVfx } from './vfx-store';
import styles from './VfxOverlay.module.css';

/** 暗転の最大の濃さ。1 にすると何も見えなくなるので上限を置く。 */
const MAX_DIM_OPACITY = 0.72;

/** 既定の設定を返す関数。毎レンダー作り直さないよう外へ出す。 */
const readDefaultSettings = (): PresentationSettings => DEFAULT_PRESENTATION_SETTINGS;

export interface VfxOverlayProps {
  getSettings?: () => PresentationSettings;
}

/**
 * Canvas へ重ねる2D演出 (フラッシュ / 暗転 / ブラー)。
 *
 * 3D 空間に置く必要のない全画面エフェクトはこちら。3D 側の揺れや軌跡は
 * VfxScene が持つ (docs/technical-design.md §5.3 / §5.5)。
 *
 * `pointer-events: none` で操作を透過させ、HUD より奥へ敷く。演出が
 * 入力を吸わないので、絵を出していてもゲームの操作は変わらない。
 */
export function VfxOverlay({
  getSettings = readDefaultSettings,
}: VfxOverlayProps): React.JSX.Element {
  const active = useVfxStore((state) => state.active);
  const now = useAnimationTime(active.length > 0);
  const scale = visualScale(getSettings());

  const flash = findVfx(active, 'FLASH');
  const dim = findVfx(active, 'DIM');
  const shockwave = findVfx(active, 'SHOCKWAVE');

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div
        className={`${styles.layer} ${styles.flash}`}
        style={{ opacity: fadeOut(flash, now) * scale }}
      />
      <div
        className={`${styles.layer} ${styles.dim}`}
        style={{ opacity: Math.min(MAX_DIM_OPACITY, fadeIn(dim, now) * scale) }}
      />
      <div
        className={`${styles.layer} ${styles.blur}`}
        style={{ opacity: fadeOut(shockwave, now) * scale }}
      />
    </div>
  );
}

/** 出た瞬間が一番濃く、尺の終わりへ向けて消える演出の不透明度。 */
function fadeOut(vfx: ActiveVfx | null, now: number): number {
  if (!vfx) return 0;
  return (1 - vfxProgress(vfx, now)) * vfx.strength;
}

/** 予兆のように、尺をかけて濃くなっていく演出の不透明度。 */
function fadeIn(vfx: ActiveVfx | null, now: number): number {
  if (!vfx) return 0;
  return vfxProgress(vfx, now) * vfx.strength;
}

/**
 * 演出が走っている間だけ実時間を返す。
 *
 * 演出が無いときは rAF を回さない。常時再描画すると、演出を切っていても
 * CPU を使い続けることになるため。
 */
function useAnimationTime(isRunning: boolean): number {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!isRunning) {
      return () => {};
    }

    let handle = requestAnimationFrame(function tick() {
      setNow(performance.now());
      handle = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(handle);
  }, [isRunning]);

  return now;
}
