import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ResultCamera } from '../result/ResultCamera';

import { readPresentationSettings } from '@/presentation/presentation-store';
import { attachMovementInput, type MovementInputAdapter } from '@/input/keyboard/movement-input';
import { requestedScene } from '@/app/scene-mode';

import { BossMesh } from '../boss/BossMesh';
import { PlayerMesh } from '../player/PlayerMesh';
import { VfxScene } from '../vfx/VfxScene';
import { Ground } from '../world/Ground';
import { WorldScene } from './WorldScene';

/** 現在の戦闘フィールドの広さ。既存の見た目を維持する (Issue #41)。 */
const COMBAT_GROUND_SIZE = 24;

/** Combat用の背景色。戦闘の暗い雰囲気を維持する。 */
const COMBAT_BACKGROUND = '#14121f';
/** ワールド探索モード用の空色。簡易ステージが屋外に見えるようにする。 */
const WORLD_BACKGROUND = '#8fc7e8';

export interface GameSceneProps {
  /**
   * ワールド探索モードの中身を出すかどうか。
   *
   * 呼び出し側が決める。ここで URL を直接見ると、
   * URLに `?scene=world` が無いままタイトルの「ワールドへ」で遷移したとき、
   * 画面はワールドのつもりなのに Combat の中身が描かれてしまうため。
   * 省略時は従来どおりURLで決める (既存の呼び出しを変えない)。
   */
  world?: boolean;
}

/**
 * Phase 1 の最小3D Scene。
 * 2.5D固定カメラ型を想定しているため、Camera は原則固定とする。
 * 決着時のみ ResultCamera が固定位置から演出する。
 * (docs/technical-design.md §3.1)
 */
export function GameScene({ world }: GameSceneProps = {}): React.JSX.Element {
  const showWorldScene = world ?? requestedScene() === 'world';

  return (
    <Canvas shadows camera={{ position: [0, 2.5, 8], fov: 50 }}>
      <color attach="background" args={[showWorldScene ? WORLD_BACKGROUND : COMBAT_BACKGROUND]} />

      <ambientLight intensity={showWorldScene ? 0.7 : 0.4} />
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
