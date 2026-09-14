import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import { HoriDaisukeModel } from '@/rendering/character/HoriDaisukeModel';
import {
  DEFAULT_MOTION,
  MOTION_CLIPS,
  type HoriDaisukeMotion,
} from '@/rendering/character/horiDaisukeMotions';

import styles from './HoriDebugPage.module.css';

const MOTIONS: readonly HoriDaisukeMotion[] = Object.keys(MOTION_CLIPS).filter(
  (name): name is HoriDaisukeMotion => name in MOTION_CLIPS,
);

/**
 * `?debug=hori` で開く、Boss堀大輔のモデル・モーション確認用の独立画面。
 *
 * ゲーム本体の状態には触れない。GLBに入っている各モーションを選んで、
 * 好きな角度から確認できるようにする。
 */
export function HoriDebugPage(): React.JSX.Element {
  const [motion, setMotion] = useState<HoriDaisukeMotion>(DEFAULT_MOTION);
  const [playToken, setPlayToken] = useState(0);
  const loops = MOTION_CLIPS[motion].loop;

  /** ループしないクリップは `key` を変えて作り直すことで頭から再生し直す。 */
  const replay = (): void => setPlayToken((value) => value + 1);

  const select = (next: HoriDaisukeMotion): void => {
    setMotion(next);
    if (next === motion) replay();
  };

  return (
    <main className={styles.page}>
      <Canvas
        shadows
        aria-label="堀大輔モデルの3Dプレビュー"
        camera={{ position: [0, 1.7, 4.5], fov: 45 }}
      >
        <color attach="background" args={['#14121f']} />

        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 4]} intensity={1.6} castShadow />

        <Suspense fallback={null}>
          <HoriDaisukeModel key={playToken} motion={motion} />
        </Suspense>

        <OrbitControls target={[0, 1.2, 0]} />
      </Canvas>

      <section className={styles.panel} aria-labelledby="hori-debug-title">
        <p className={styles.eyebrow}>Boss Model / Debug</p>
        <h1 id="hori-debug-title">堀大輔 モーション確認</h1>
        <p>
          GLBに入っているモーションを切り替えて確認できます。ドラッグで視点を回し、
          ホイールで拡大できます。
        </p>

        <fieldset className={styles.motions} aria-label="モーション選択">
          {MOTIONS.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.motion}
              aria-pressed={name === motion}
              onClick={() => select(name)}
            >
              {name}
            </button>
          ))}
        </fieldset>

        <button type="button" className={styles.replay} onClick={replay}>
          {loops ? '最初から再生' : 'もう一度再生'}
        </button>
      </section>
    </main>
  );
}
