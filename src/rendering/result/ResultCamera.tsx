import { useFrame } from '@react-three/fiber';
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
      camera.position.set(0, 2.5, 8 + Math.min(t, 1.4) * 0.3);
      camera.lookAt(0, 0, 1);
    }
  });
  return null;
}
