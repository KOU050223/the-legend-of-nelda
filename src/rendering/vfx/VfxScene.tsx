import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';

import {
  DEFAULT_PRESENTATION_SETTINGS,
  visualScale,
  type PresentationSettings,
} from '@/presentation/presentation-settings';

import { findVfx, useVfxStore, vfxProgress } from './vfx-store';

/** シェイクの最大振幅 (ワールド単位)。強度1・strength1 のときの値。 */
const SHAKE_AMPLITUDE = 0.22;

/** 衝撃波リングが広がりきる半径。 */
const SHOCKWAVE_MAX_SCALE = 9;

/** 既定の設定を返す関数。毎レンダー作り直さないよう外へ出す。 */
const readDefaultSettings = (): PresentationSettings => DEFAULT_PRESENTATION_SETTINGS;

export interface VfxSceneProps {
  children: React.ReactNode;
  getSettings?: () => PresentationSettings;
}

/**
 * 3D 側の演出をまとめる。docs/technical-design.md §5.3。
 *
 * カメラではなくシーンの中身を包んだ `<group>` を揺らす。OrbitControls が
 * 毎フレーム camera を上書きするため、camera を直接動かしても打ち消される。
 *
 * 演出の時間は `performance.now()` (useFrame の clock) で測る。Game Logic の
 * GameClock は止めない。止めると入力受付ウィンドウがずれて判定が壊れるため、
 * ヒットストップも「ボスの姿勢を固定して見せる」だけで実装する。
 */
export function VfxScene({
  children,
  getSettings = readDefaultSettings,
}: VfxSceneProps): React.JSX.Element {
  const shakeRef = useRef<Group>(null);
  const shockwaveRef = useRef<Mesh>(null);
  const trailRef = useRef<Mesh>(null);
  const futonRef = useRef<Mesh>(null);

  useFrame(() => {
    const now = performance.now();
    const store = useVfxStore.getState();
    store.prune(now);

    const scale = visualScale(getSettings());
    const { active } = useVfxStore.getState();

    applyShake(shakeRef.current, findVfx(active, 'SHAKE'), now, scale);
    applyShockwave(shockwaveRef.current, findVfx(active, 'SHOCKWAVE'), now, scale);
    applySweepTrail(trailRef.current, findVfx(active, 'SWEEP_TRAIL'), now, scale);
    applyFutonBrace(futonRef.current, findVfx(active, 'FUTON_BRACE'), now, scale);
  });

  return (
    <group ref={shakeRef}>
      {children}

      {/* あくび衝撃波。ボスから広がるリング。 */}
      <mesh
        ref={shockwaveRef}
        position={[0, 1.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.9, 1.1, 48]} />
        <meshBasicMaterial color="#8fd0ff" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* ふかふか布団。構えた側へ寄せて置き、回避方向を読ませる。 */}
      <mesh ref={futonRef} position={[0, 1.6, 0.6]} visible={false}>
        <boxGeometry args={[2.6, 2.0, 0.4]} />
        <meshBasicMaterial color="#f2e4ff" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 枕薙ぎ払いの軌跡。左右どちらから来るかで X の符号を変える。 */}
      <mesh ref={trailRef} position={[0, 1.4, 1.2]} visible={false}>
        <planeGeometry args={[5.2, 0.5]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 減衰するランダム揺れ。終わりに向けて振幅を落とす。 */
function applyShake(
  group: Group | null,
  vfx: ReturnType<typeof findVfx>,
  now: number,
  scale: number,
): void {
  if (!group) return;

  if (!vfx || scale <= 0) {
    group.position.set(0, 0, 0);
    return;
  }

  const decay = 1 - vfxProgress(vfx, now);
  const amplitude = SHAKE_AMPLITUDE * vfx.strength * scale * decay;

  // 時間から位相を作る。乱数を使わないので、同じ時刻なら同じ揺れになり
  // フレームレートで見え方が変わらない。
  group.position.set(
    Math.sin(now * 0.08) * amplitude,
    Math.sin(now * 0.13 + 1.7) * amplitude * 0.6,
    0,
  );
}

/** 広がって薄くなるリング。 */
function applyShockwave(
  mesh: Mesh | null,
  vfx: ReturnType<typeof findVfx>,
  now: number,
  scale: number,
): void {
  if (!mesh) return;

  if (!vfx || scale <= 0) {
    mesh.visible = false;
    return;
  }

  const progress = vfxProgress(vfx, now);
  const size = 0.4 + progress * SHOCKWAVE_MAX_SCALE;

  mesh.visible = true;
  mesh.scale.set(size, size, 1);
  setOpacity(mesh, (1 - progress) * vfx.strength * scale);
}

/** 横薙ぎの軌跡。Cue ID の向きに合わせて画面を横切らせる。 */
function applySweepTrail(
  mesh: Mesh | null,
  vfx: ReturnType<typeof findVfx>,
  now: number,
  scale: number,
): void {
  if (!mesh) return;

  if (!vfx || scale <= 0) {
    mesh.visible = false;
    return;
  }

  const progress = vfxProgress(vfx, now);
  // Cue ID に向きが埋まっている (pillow-sweep.ts)。右から来るなら右→左へ走らせる。
  const fromRight = vfx.cueId?.endsWith('-right') ?? false;
  const travel = fromRight ? 1 - progress * 2 : progress * 2 - 1;

  mesh.visible = true;
  mesh.position.setX(travel * 3);
  // 予兆の後半で濃くする。構えの間から出しっぱなしにしない。
  setOpacity(mesh, Math.max(0, progress - 0.5) * 2 * vfx.strength * scale);
}

/**
 * 構えた布団。左右どちらに構えたかを位置で示す。
 *
 * 仕様 §10 の「布団を右または左に構える / 攻撃方向が分かる」に当たる。
 * 暗転 (DIM) だけでは左右の区別がつかず、布団の Audio Cue は無方向なので、
 * ここがプレイヤーの回避方向の唯一の手がかりになる。
 */
function applyFutonBrace(
  mesh: Mesh | null,
  vfx: ReturnType<typeof findVfx>,
  now: number,
  scale: number,
): void {
  if (!mesh) return;

  if (!vfx || scale <= 0) {
    mesh.visible = false;
    return;
  }

  const progress = vfxProgress(vfx, now);
  const fromRight = vfx.cueId?.endsWith('-right') ?? false;

  mesh.visible = true;
  // 構えた側から中央へ寄せる。着弾の向きが読めるよう、予兆のあいだ
  // 左右どちらに居るかをはっきり離して見せる。
  mesh.position.setX((fromRight ? 1 : -1) * (3.2 - progress * 1.2));
  // 予兆の進みに合わせて濃くする。召喚されてくる見え方にする。
  setOpacity(mesh, Math.min(1, progress * 1.6) * vfx.strength * scale);
}

function setOpacity(mesh: Mesh, opacity: number): void {
  // このコンポーネントが作った mesh だけを触るので material は単体。
  // 配列になるのは複数マテリアルを割り当てた場合だけで、ここでは起きない。
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!material) return;

  material.opacity = Math.min(1, Math.max(0, opacity));
}
