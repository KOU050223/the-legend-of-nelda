import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, type Group, type Mesh } from 'three';

import type { PlanarPosition } from '@/game/movement/types';
import { visualScale } from '@/presentation/presentation-settings';
import { readPresentationSettings } from '@/presentation/presentation-store';

import {
  dumbbellSlamStateAt,
  dumbbellSlamVisibility,
  type DumbbellSlamTiming,
} from './dumbbell-slam';

/**
 * 絶対起床アラームの演出。ダンベルを振り上げて地面へ叩きつけ、
 * 着弾と同時に衝撃波が広がる (Issue #122)。
 *
 * 危険範囲そのものは `DangerZoneMarks` が今まで通り描く。ここは判定を
 * 持たない飾りなので、演出強度 0 のときは丸ごと消える (Issue #11 完了条件:
 * 絵を切ってもゲームロジックは変わらない)。
 *
 * 位置は `snapshot.boss.activeAttack.aim.origin`、つまり判定に使っている
 * リングの中心と同じ値から取る。ボスの現在位置を使わないのは、アラームの
 * 狙いが予兆の開始時に固定されるため (hori-attacks.ts)。ボスが動いても
 * 衝撃波は判定のリングから離れない。
 *
 * 時間は snapshot のゲームクロック (`takenAt - startedAt`) で測る。
 * `performance.now()` を使うと、リモートのクライアントでは原点が違って
 * 予兆と衝撃波がずれる (hori-boss.ts の `takenAt` の但し書き)。
 */

/** ダンベルのシャフトの長さ。 */
const SHAFT_LENGTH = 1.6;

/** プレートの半径。 */
const PLATE_RADIUS = 0.62;

/** 毎フレーム書き換わる演出の入力。 */
export interface DumbbellSlamFrame {
  /** 判定リングの中心。予兆の開始時に固定された狙い。 */
  readonly origin: PlanarPosition;
  /** 技が始まってからの経過ミリ秒。snapshot のゲームクロックで測る。 */
  readonly elapsedMs: number;
  /** この技に適用済みの尺。オーバードライブで縮んでいることがある。 */
  readonly timing: DumbbellSlamTiming;
}

export interface DumbbellSlamProps {
  /**
   * 現在の演出の入力。絶対起床アラームが出ていなければ null。
   *
   * ref で受け取るのは、経過時間が毎フレーム変わるため。props で渡すと
   * 1フレームごとに React の再レンダーが走る (このシーンが位置を
   * Object3D へ直接入れているのと同じ理由)。
   */
  frame: React.RefObject<DumbbellSlamFrame | null>;
}

export function DumbbellSlam({ frame }: DumbbellSlamProps): React.JSX.Element {
  const dumbbell = useRef<Group>(null);
  const shockwave = useRef<Mesh>(null);

  useFrame(() => {
    const scale = visualScale(readPresentationSettings());
    const current = frame.current;
    const state =
      current === null
        ? {
            phase: 'NONE' as const,
            dumbbellY: 0,
            dumbbellSquash: 1,
            shockwaveRadius: 0,
            shockwaveOpacity: 0,
          }
        : dumbbellSlamStateAt(current.elapsedMs, current.timing);

    // 何を描くかは Pure function 側で決める (演出強度 0 で消えることの
    // テストを Three.js 抜きで書けるようにするため)。
    const show = dumbbellSlamVisibility(state, scale);

    if (dumbbell.current) {
      const visible = current !== null && show.dumbbell;
      dumbbell.current.visible = visible;
      if (visible && current !== null) {
        dumbbell.current.position.set(current.origin.x, state.dumbbellY, current.origin.z);
        // 落ちるあいだに少し回す。まっすぐ降りるだけだと投げた物に見えない。
        dumbbell.current.rotation.z = state.phase === 'IMPACT' ? 0 : current.elapsedMs * 0.004;
        dumbbell.current.scale.set(1, state.dumbbellSquash, 1);
      }
    }

    if (shockwave.current) {
      const visible = current !== null && show.shockwave;
      shockwave.current.visible = visible;
      if (visible && current !== null) {
        shockwave.current.position.set(current.origin.x, GROUND_OFFSET_Y, current.origin.z);
        // ringGeometry を半径1で作り、スケールで広げる。毎フレーム
        // ジオメトリを作り直すとフレーム落ちの原因になる。
        shockwave.current.scale.set(state.shockwaveRadius, state.shockwaveRadius, 1);
        setOpacity(shockwave.current, state.shockwaveOpacity * scale);
      }
    }
  });

  return (
    <>
      <group ref={dumbbell} visible={false}>
        {/* シャフト。横倒しに持つので Z 方向へ寝かせる。 */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, SHAFT_LENGTH, 12]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* 左右のプレート。 */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[(side * SHAFT_LENGTH) / 2, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[PLATE_RADIUS, PLATE_RADIUS, 0.34, 20]} />
            <meshStandardMaterial color="#2b2f36" metalness={0.3} roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/*
        衝撃波。細い輪郭だけにして、下の危険範囲マークを塗り潰さない
        (「B級演出でも情報は潰さない」Issue #58)。半径1で作りスケールで広げる。
      */}
      <mesh ref={shockwave} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.93, 1, 64]} />
        <meshBasicMaterial
          color="#fff2c4"
          transparent
          opacity={0}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/**
 * 衝撃波の地面からの浮き。`DangerZoneMarks` の GROUND_OFFSET_Y より少し上へ
 * 出し、危険範囲マークと Z-fighting を起こさないようにする。
 */
const GROUND_OFFSET_Y = 0.5;

function setOpacity(mesh: Mesh, opacity: number): void {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!material) return;
  material.opacity = Math.min(1, Math.max(0, opacity));
}
