import { Sparkles } from '@react-three/drei';
import { useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useMemo, useRef, type RefObject } from 'react';
import {
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Group,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { FinaleState } from '@/game/finale/finale-state';
import ocarinaModelUrl from '../../../assets/items/Ocarina3D/10389_Ocarina-L2.obj?url';
import ocarinaTextureUrl from '../../../assets/items/Ocarina3D/OcarinaC.JPG?url';

/**
 * OBJ/MTL一式のオカリナ。MTLは黒い拡散色を指定しているため、JPGは明示的に
 * StandardMaterialへ貼る。これでステージ照明でも模様を読める明るさに保てる。
 */
function OcarinaModel(): React.JSX.Element {
  const source = useLoader(OBJLoader, ocarinaModelUrl);
  const texture = useLoader(TextureLoader, ocarinaTextureUrl);
  const model = useMemo(() => {
    // useLoader のキャッシュを直接変更せず、このモデル専用のテクスチャにする。
    const colorTexture = texture.clone();
    colorTexture.colorSpace = SRGBColorSpace;
    const clone = source.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material = new MeshStandardMaterial({
        map: colorTexture,
        roughness: 0.48,
        metalness: 0.06,
      });
    });
    return clone;
  }, [source, texture]);

  // 元モデルはY軸が長手方向。演奏面を正面へ向けたうえで少し仰がせる。
  return <primitive object={model} rotation={[0.18, 0, Math.PI / 2]} scale={0.34} />;
}

/** 祭壇へ唐突に現れる伝説のオカリナ。 */
export function LegendaryOcarina({
  phase,
  anchor,
}: {
  phase: FinaleState;
  /** 降下先。ボスの頭上を使い、全員が見失わない位置にする。 */
  anchor: RefObject<Group | null>;
}): React.JSX.Element | null {
  const root = useRef<Group>(null);
  const ocarina = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);
  const previousPhase = useRef<FinaleState>(phase);
  const anchorPosition = useRef(new Vector3());
  const cinematicPosition = useRef(new Vector3());
  const cinematicTarget = useRef(new Vector3());
  const visible = phase === 'OCARINA_APPEARING' || phase === 'WAITING_FOR_MELODY';
  const descending = phase === 'OCARINA_APPEARING';

  // 同じ優先度のuseFrameはmount順で動く。親SceneではFollowCameraの後に置き、
  // カメラが確定したフレームの姿勢へ追従させる。
  useFrame((state, delta) => {
    if (root.current === null) return;
    const { camera } = state;
    if (previousPhase.current !== phase) {
      previousPhase.current = phase;
      startedAt.current = null;
    }
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current;
    const progress = descending ? Math.min(1, elapsed / 3.8) : 1;
    const eased = 1 - (1 - progress) ** 4;
    const hover = Math.sin(state.clock.elapsedTime * 2.2) * (descending ? 0.02 : 0.12);
    const landingAnchor = anchor.current;
    if (landingAnchor === null) return;
    landingAnchor.getWorldPosition(anchorPosition.current);

    // オカリナはボスの頭上、空高くから実際に落とす。カメラ追従の疑似UIにはしない。
    root.current.position.copy(anchorPosition.current);
    root.current.position.y += 10.5 - 7.8 * eased + hover;
    root.current.lookAt(camera.position);
    root.current.scale.setScalar(0.82 * Math.min(1, 0.35 + progress));

    // 地上寄りの固定カメラで空を見上げる。開始時は高いオカリナへ視線が上がり、
    // 降下に合わせて自然に地上へ戻るため「空から降ってきた」と読める。
    cinematicPosition.current.copy(anchorPosition.current).add(new Vector3(3.8, 3.3, 5));
    const positionFactor = 1 - Math.exp(-6 * delta);
    camera.position.lerp(cinematicPosition.current, positionFactor);
    cinematicTarget.current.copy(root.current.position);
    cinematicTarget.current.y -= 0.8;
    camera.lookAt(cinematicTarget.current);
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
        {/* OBJの読み込み中も戦闘Sceneを消さない。 */}
        <Suspense fallback={null}>
          <OcarinaModel />
        </Suspense>
      </group>
    </group>
  );
}
