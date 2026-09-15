import { Sparkles } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3, type Group } from 'three';
import type { FinaleState } from '@/game/finale/finale-state';

/** 祭壇へ唐突に現れる伝説のオカリナ。正式アセット導入までの演出用プリミティブ。 */
export function LegendaryOcarina({ phase }: { phase: FinaleState }): React.JSX.Element | null {
  const camera = useThree((state) => state.camera);
  const root = useRef<Group>(null);
  const ocarina = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);
  const previousPhase = useRef<FinaleState>(phase);
  const visible = phase === 'OCARINA_APPEARING' || phase === 'WAITING_FOR_MELODY';
  const descending = phase === 'OCARINA_APPEARING';

  // 同じ優先度のuseFrameはmount順で動く。親SceneではFollowCameraの後に置き、
  // カメラが確定したフレームの姿勢へ追従させる。
  useFrame((state) => {
    if (root.current === null) return;
    if (previousPhase.current !== phase) {
      previousPhase.current = phase;
      startedAt.current = null;
    }
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current;
    // カメラローカル座標で置く。フィールド上の一点ではなく、全プレイヤーの
    // 画面上端から中央へ舞い降りる演出として必ず読めるようにする。
    const progress = descending ? Math.min(1, elapsed / 3.8) : 1;
    const eased = 1 - (1 - progress) ** 4;
    const hover = Math.sin(state.clock.elapsedTime * 2.2) * (descending ? 0.02 : 0.12);
    const localPosition = new Vector3(0, 6 - 5.5 * eased + hover, -7).applyQuaternion(
      camera.quaternion,
    );
    root.current.position.copy(camera.position).add(localPosition);
    // カメラの姿勢をそのまま使い、穴の開いた正面を常にプレイヤーへ向ける。
    // フィールドを上から見下ろす角度をモデルへ持ち込まない。
    root.current.quaternion.copy(camera.quaternion);
    root.current.scale.setScalar(0.82 * Math.min(1, 0.35 + progress));
    if (ocarina.current !== null) {
      // 回転するのは本体だけ。降下全体で一周し、始まりと終わりはゆっくりにする。
      // 着地時はちょうど正面へ戻るので、粒子だけが残っても落ち着いて見える。
      const sacredTurn = (1 - Math.cos(progress * Math.PI)) * Math.PI;
      ocarina.current.rotation.z = descending ? sacredTurn : 0;
    }
  });

  if (!visible) return null;

  return (
    <group ref={root}>
      <pointLight color="#ffe37a" intensity={18} distance={10} />
      {descending && (
        <mesh position={[0, -5.5, 0]}>
          <cylinderGeometry args={[0.45, 2.6, 12, 24, 1, true]} />
          <meshBasicMaterial color="#ffe88a" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <Sparkles count={110} scale={[4, 9, 4]} size={4} speed={0.35} color="#ffe58a" />
      <group ref={ocarina}>
        <mesh castShadow scale={[1.3, 0.55, 0.65]}>
          <sphereGeometry args={[1, 32, 20]} />
          <meshStandardMaterial color="#316f9b" emissive="#bde9ff" emissiveIntensity={0.65} />
        </mesh>
        {[-0.55, -0.18, 0.18, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.35, 0.53]}>
            <circleGeometry args={[0.13, 16]} />
            <meshBasicMaterial color="#071321" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
