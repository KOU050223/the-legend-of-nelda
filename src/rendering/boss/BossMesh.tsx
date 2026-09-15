import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useGameStore } from '@/store/game-store';
import type { CombatState } from '@/game/types/combat-state';
import { RESULT_TIMING } from '@/ui/result/result-presentation';

import { readPresentationSettings } from '@/presentation/presentation-store';
import { visualScale } from '@/presentation/presentation-settings';

import { hitStopDelta } from '../vfx/hit-stop';
import { useVfxStore } from '../vfx/vfx-store';
import { HoriDaisukeModel } from '../character/HoriDaisukeModel';
import type { MotionContext } from '../character/motion-manifest';

export function motionContextForCombatState(state: CombatState): MotionContext {
  return { attacking: state === 'ATTACK' };
}

/**
 * Boss「堀大輔」。GLBモデルとモーションは HoriDaisukeModel が担当し、
 * ここでは戦闘のVFXに合わせた揺れと決着時の吹き飛びだけを扱う。
 *
 * GLBの読み込み中は Graybox First の箱を出す (docs/technical-design.md §12)。
 */
export function BossMesh(): React.JSX.Element {
  const combatState = useGameStore((state) => state.combatState);
  const root = useRef<Group>(null);
  const idlePhase = useRef(0);
  const defeatRotation = useRef<number | null>(null);

  useFrame((_, delta) => {
    if (root.current) {
      const result = useGameStore.getState().result;
      if (!result) {
        // 通常戦闘では既存VFXのヒットストップと演出強度を反映する。
        // グレーボックスの頃は回転し続けていたが、人型モデルだと背中を
        // 見せ続けてしまうため、正面を保つ小さな揺れに留める。
        const { active } = useVfxStore.getState();
        const scale = visualScale(readPresentationSettings());
        idlePhase.current += hitStopDelta(delta, active, performance.now(), scale) * 0.6;
        root.current.rotation.y = Math.sin(idlePhase.current) * 0.12;
        return;
      }
      if (result.outcome !== 'victory') return;
      defeatRotation.current ??= root.current.rotation.y % (Math.PI * 2);
      if (result.elapsedMs <= RESULT_TIMING.hitStop) return;
      const t = Math.max(
        0,
        Math.min(1, (result.elapsedMs - RESULT_TIMING.hitStop) / RESULT_TIMING.reaction),
      );
      root.current.position.set(0, Math.sin(t * Math.PI) * 2.8 - t * 0.35, -t * 3);
      root.current.rotation.set(
        -t * Math.PI * 1.5,
        defeatRotation.current * (1 - t) + t * Math.PI * 4,
        t * 0.25,
      );
    }
  });

  return (
    <group ref={root}>
      <Suspense fallback={<BossPlaceholder />}>
        <HoriDaisukeModel context={motionContextForCombatState(combatState)} />
      </Suspense>
    </group>
  );
}

/** モデル読込中だけ出す仮Boss。旧Grayboxと同じ位置・寸法を保つ。 */
function BossPlaceholder(): React.JSX.Element {
  return (
    <mesh position={[0, 1.2, 0]} castShadow>
      <boxGeometry args={[1.6, 2.4, 1.6]} />
      <meshStandardMaterial color="#6b4fa0" />
    </mesh>
  );
}
