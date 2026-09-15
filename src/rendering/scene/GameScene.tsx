import { Canvas } from '@react-three/fiber';
import { ResultCamera } from '../result/ResultCamera';

import { readPresentationSettings } from '@/presentation/presentation-store';
import { requestedScene } from '@/app/scene-mode';

import { BossMesh } from '../boss/BossMesh';
import { PlayerMesh } from '../player/PlayerMesh';
import { VfxScene } from '../vfx/VfxScene';
import { Ground } from '../world/Ground';
import { WorldScene } from './WorldScene';
import { MultiplayerArenaScene } from './MultiplayerArenaScene';

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
  /** 本番マルチプレイ (GAME画面) の中身を出すかどうか。worldより優先する。 */
  multiplayer?: boolean;
}

/**
 * Phase 1 の最小3D Scene。
 * 2.5D固定カメラ型を想定しているため、Camera は原則固定とする。
 * 決着時のみ ResultCamera が固定位置から演出する。
 * (docs/technical-design.md §3.1)
 */
export function GameScene({ world, multiplayer }: GameSceneProps = {}): React.JSX.Element {
  // WorldSceneとMultiplayerArenaSceneは同じ草原の見た目 (BossArenaScene) を
  // 共有するため、背景・光源はこの2つをまとめて「アリーナ系」として選ぶ。
  const showArenaVisuals = multiplayer || (world ?? requestedScene() === 'world');

  return (
    <Canvas shadows camera={{ position: [0, 2.5, 8], fov: 50 }}>
      <color attach="background" args={[showArenaVisuals ? WORLD_BACKGROUND : COMBAT_BACKGROUND]} />

      <ambientLight intensity={showArenaVisuals ? 0.7 : 0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow />

      {multiplayer ? (
        <MultiplayerArenaScene />
      ) : showArenaVisuals ? (
        <WorldScene />
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
