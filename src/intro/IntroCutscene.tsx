import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

import { CharacterModel } from '@/rendering/character/CharacterModel';
import { HoriDaisukeModel } from '@/rendering/character/HoriDaisukeModel';
import { World } from '@/rendering/world/World';

import { AncientRuinsSet } from './AncientRuinsSet';
import { INTRO_DURATION_MS, shotAt } from './cutscene-timeline';
import styles from './IntroCutscene.module.css';

// 堀大輔カットへ入ってからGLBを待つと、登場演出そのものが欠ける。
// 実体の表示はTimeline側に任せつつ、タイトルからの読み込み中に先行取得する。
useGLTF.preload('/models/hori-daisuke.glb');

export function IntroCutscene({ onComplete }: { onComplete: () => void }): React.JSX.Element {
  const [elapsedMs, setElapsedMs] = useState(0);
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const startedAt = performance.now();
    let frameId = 0;
    const tick = (): void => {
      const elapsed = performance.now() - startedAt;
      if (elapsed >= INTRO_DURATION_MS) return finish();
      setElapsedMs(elapsed);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    const skip = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' || event.code === 'Enter') finish();
    };
    window.addEventListener('keydown', skip);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', skip);
    };
  }, [finish]);

  const shot = shotAt(elapsedMs);
  const isHoriCut =
    shot.focus === 'HORI_INTRO' || shot.focus === 'HORI_AWAKENED' || shot.focus === 'HORI_HERO';
  const usesRuinsSet = shot.focus === 'RUINS_WIDE' || shot.focus === 'RUINS_APPROACH' || isHoriCut;
  const heroesAreRevealed =
    shot.focus === 'REVEAL' ||
    shot.focus === 'FINAL' ||
    shot.focus === 'ODORUNO' ||
    shot.focus === 'PAY' ||
    shot.focus === 'ORA';
  return (
    <main className={styles.page}>
      <Canvas className={styles.canvas} shadows camera={{ position: [24, 13, 27], fov: 48 }}>
        <color attach="background" args={[usesRuinsSet ? '#1b2440' : '#12101d']} />
        {usesRuinsSet ? (
          <AncientRuinsSet villainAwakened={shot.focus !== 'HORI_INTRO'} />
        ) : (
          <World />
        )}
        {!usesRuinsSet && <ambientLight intensity={0.65} />}
        {!usesRuinsSet && <directionalLight position={[5, 8, 5]} intensity={1.7} castShadow />}
        <CutsceneCamera elapsedMs={elapsedMs} />
        {isHoriCut ? (
          <Suspense fallback={null}>
            <group position={[0, 0.4, 0.5]} scale={1.35}>
              <HoriDaisukeModel clip="stand-up" />
            </group>
          </Suspense>
        ) : (
          !usesRuinsSet && (
            <Suspense fallback={null}>
              <group position={[0, 0, -3]}>
                <HoriDaisukeModel clip="stand-up" />
              </group>
              {heroesAreRevealed && <Heroes />}
            </Suspense>
          )
        )}
      </Canvas>
      <p className={styles.subtitle}>{shot.subtitle}</p>
      <button type="button" className={styles.skip} onClick={finish}>
        SKIP <kbd>Esc</kbd>
      </button>
    </main>
  );
}

function Heroes(): React.JSX.Element {
  return (
    <>
      <group position={[-3, 0, 0]} rotation={[0, Math.PI - 0.3, 0]}>
        <CharacterModel characterId="ODORUNO" />
      </group>
      <group position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
        <CharacterModel characterId="PAY" />
      </group>
      <group position={[3, 0, 0]} rotation={[0, Math.PI + 0.3, 0]}>
        <CharacterModel characterId="ORA" />
      </group>
    </>
  );
}

function CutsceneCamera({ elapsedMs }: { elapsedMs: number }): null {
  const { camera } = useThree();
  const targetPosition = useMemo(() => new Vector3(), []);
  const targetLookAt = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const shot = shotAt(elapsedMs);
    camera.position.lerp(targetPosition.set(...shot.camera), 0.08);
    camera.lookAt(targetLookAt.set(...shot.lookAt));
  });
  return null;
}
