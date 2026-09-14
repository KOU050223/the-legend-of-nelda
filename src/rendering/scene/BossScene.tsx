import { Canvas, useFrame } from '@react-three/fiber';

import { BossArenaPreview } from '../boss/BossArenaPreview';

/**
 * 危険範囲が読めるよう、アリーナ全体が収まる俯瞰から見る。
 * 真上すぎると高さのある物 (ボス) が潰れるので、少し手前へ引く。
 */
const PREVIEW_CAMERA = { position: [0, 42, 30] as const, fov: 50, lookAt: [0, 0, 0] as const };

/**
 * 堀大輔の危険範囲を目視確認するための開発用シーン (`?scene=boss`)。
 * Issue #58 の「危険範囲が視覚的に読める」を目で確かめるための画面で、
 * ボスアリーナ本体は #54 のスコープ。
 */
/**
 * 俯瞰カメラを原点へ向ける。
 *
 * Canvas の `camera` prop は位置しか渡せず、`onCreated` で lookAt しても
 * R3F が既定の向きで上書きするため、Scene の内側から毎回向け直す。
 */
function PreviewCamera(): null {
  useFrame(({ camera }) => {
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function BossScene(): React.JSX.Element {
  return (
    <Canvas camera={{ position: [...PREVIEW_CAMERA.position], fov: PREVIEW_CAMERA.fov }}>
      <color attach="background" args={['#14121f']} />
      <PreviewCamera />
      <BossArenaPreview />
    </Canvas>
  );
}
