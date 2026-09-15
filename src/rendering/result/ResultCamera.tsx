import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import { getDefeatCinematicState } from '@/game/cinematic/defeat-cinematic';
import { useGameStore } from '@/store/game-store';

export function ResultCamera(): null {
  useFrame(({ camera }) => {
    const result = useGameStore.getState().result;
    if (!result) {
      camera.position.set(0, 2.5, 8);
      camera.lookAt(0, 0, 0);
      return;
    }
    const t = result.elapsedMs / 1000;
    if (result.outcome === 'victory') {
      const shake = t > 0.2 ? Math.max(0, 1 - (t - 0.2) / 0.8) * 0.12 : 0;
      camera.position.set(
        Math.sin(t * 83) * shake,
        2.5 + Math.cos(t * 71) * shake,
        8 - Math.min(t, 1.3),
      );
      camera.lookAt(0, 0.5, -0.5);
    } else {
      const cinematic = getDefeatCinematicState(result.elapsedMs);
      const eased = MathUtils.smoothstep(cinematic.progress, 0, 1);
      if (cinematic.cut === 'SLEEP') {
        camera.position.set(0, 2.5, 8 - eased * 0.7);
        camera.lookAt(0, 0.45, 2.8);
      } else if (cinematic.cut === 'BOSS_REVEAL') {
        camera.position.set(eased * 0.8, 2.5 - eased * 0.45, 7.3 - eased * 0.7);
        camera.lookAt(0, 0.9, 0.9);
      } else if (cinematic.cut === 'WORLD_FALL') {
        camera.position.set(0.8 + eased * 2.2, 2.05 + eased * 2.8, 6.6 + eased * 4.2);
        camera.lookAt(0, eased * 0.4, 0);
      } else {
        camera.position.set(3, 4.8, 10.8);
        camera.lookAt(0, 0, 0);
      }
    }
  });
  return null;
}
