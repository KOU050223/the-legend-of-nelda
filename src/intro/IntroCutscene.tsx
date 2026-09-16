import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

import { CharacterModel } from '@/rendering/character/CharacterModel';
import { HoriDaisukeModel } from '@/rendering/character/HoriDaisukeModel';
import { World } from '@/rendering/world/World';

import { AncientRuinsSet } from './AncientRuinsSet';
import { INTRO_SHOTS } from './cutscene-timeline';
import { createIntroVoicePlayer, type IntroVoicePlayer } from './intro-voice';
import styles from './IntroCutscene.module.css';

// 堀大輔カットへ入ってからGLBを待つと、登場演出そのものが欠ける。
// 実体の表示はTimeline側に任せつつ、タイトルからの読み込み中に先行取得する。
useGLTF.preload('/models/hori-daisuke.glb');

export function IntroCutscene({ onComplete }: { onComplete: () => void }): React.JSX.Element {
  const [shotIndex, setShotIndex] = useState(0);
  const finished = useRef(false);
  const voicePlayer = useRef<IntroVoicePlayer | null>(null);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    voicePlayer.current?.stop();
    onComplete();
  }, [onComplete]);
  const advanceToNextShot = useCallback(
    (completedShotIndex: number) => {
      setShotIndex((currentShotIndex) => {
        if (currentShotIndex !== completedShotIndex) return currentShotIndex;
        if (currentShotIndex >= INTRO_SHOTS.length - 1) {
          finish();
          return currentShotIndex;
        }
        return currentShotIndex + 1;
      });
    },
    [finish],
  );

  useLayoutEffect(() => {
    const fallbackTimers = new Set<number>();
    const player = createIntroVoicePlayer({
      onEnded: advanceToNextShot,
      onPlayError: (failedShotIndex) => {
        const fallbackDurationMs = INTRO_SHOTS[failedShotIndex]?.durationMs ?? 0;
        const timerId = window.setTimeout(() => {
          fallbackTimers.delete(timerId);
          if (voicePlayer.current !== player) return;
          advanceToNextShot(failedShotIndex);
        }, fallbackDurationMs);
        fallbackTimers.add(timerId);
      },
    });
    voicePlayer.current = player;
    player.play(0);

    return () => {
      voicePlayer.current = null;
      for (const timerId of fallbackTimers) window.clearTimeout(timerId);
      player.dispose();
    };
  }, [advanceToNextShot]);

  useEffect(() => {
    const skip = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' || event.code === 'Enter') finish();
    };
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
    };
  }, [finish]);

  useEffect(() => {
    if (shotIndex === 0) return;
    voicePlayer.current?.play(shotIndex);
  }, [shotIndex]);

  const shot = INTRO_SHOTS[shotIndex]!;
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
        <CutsceneCamera shotIndex={shotIndex} />
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

function CutsceneCamera({ shotIndex }: { shotIndex: number }): null {
  const { camera } = useThree();
  const targetPosition = useMemo(() => new Vector3(), []);
  const targetLookAt = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const shot = INTRO_SHOTS[shotIndex]!;
    camera.position.lerp(targetPosition.set(...shot.camera), 0.08);
    camera.lookAt(targetLookAt.set(...shot.lookAt));
  });
  return null;
}
