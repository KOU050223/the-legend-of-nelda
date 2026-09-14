import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ResultCamera } from '../result/ResultCamera';

import { readPresentationSettings } from '@/presentation/presentation-store';
import { attachMovementInput, type MovementInputAdapter } from '@/input/keyboard/movement-input';
import { isWorldSceneRequested } from '@/app/scene-mode';

import { BossMesh } from '../boss/BossMesh';
import { PlayerMesh } from '../player/PlayerMesh';
import { VfxScene } from '../vfx/VfxScene';
import { Ground } from '../world/Ground';
import { WorldScene } from './WorldScene';

/** 現在の戦闘フィールドの広さ。既存の見た目を維持する (Issue #41)。 */
const COMBAT_GROUND_SIZE = 24;

/**
 * Phase 1 の最小3D Scene。
 * 2.5D固定カメラ型を想定しているため、Camera は原則固定とする。
 * 決着時のみ ResultCamera が固定位置から演出する。
 * (docs/technical-design.md §3.1)
 */
export function GameScene(): React.JSX.Element {
  const showWorldScene = isWorldSceneRequested();

  return (
    <Canvas shadows camera={{ position: [0, 2.5, 8], fov: 50 }}>
      <color attach="background" args={['#14121f']} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow />

      {showWorldScene ? (
        <WorldSceneEntry />
      ) : (
        <>
          {/*
            カメラシェイクはシーンの中身を包んだ group を動かして表現する。
            通常戦闘のVFXはgroup、決着後のカメラはResultCameraが担当する。
            Ground もシェイク対象に含め、既存の見た目を変えない。
          */}
          <VfxScene getSettings={readPresentationSettings}>
            <BossMesh />
            <PlayerMesh />
            <Ground size={COMBAT_GROUND_SIZE} />
          </VfxScene>

          <ResultCamera />
        </>
      )}
    </Canvas>
  );
}

/**
 * Canvas の子として movement input を購読する。
 *
 * `attachMovementInput` は DOM の keydown/keyup/blur を window へ登録する。
 * App.tsx の Battle と同じ理由 (StrictMode の二重マウントでも購読が二重に
 * 残らないようにするため) で、生成と破棄を同じ Effect に閉じ込める。
 */
function WorldSceneEntry(): React.JSX.Element {
  const adapterRef = useRef<MovementInputAdapter | null>(null);

  useEffect(() => {
    const adapter = attachMovementInput();
    adapterRef.current = adapter;
    return () => {
      adapter.detach();
      adapterRef.current = null;
    };
  }, []);

  return <WorldScene getInput={() => adapterRef.current?.getInput() ?? { forward: 0, right: 0 }} />;
}
