import { Canvas, useFrame } from '@react-three/fiber';

import { BossArenaScene } from '../boss/BossArenaScene';

/**
 * 危険範囲が読めるよう、アリーナ全体が収まる俯瞰から見る。
 * 真上すぎると高さのある物 (ボス) が潰れるので、少し手前へ引く。
 */
const PREVIEW_CAMERA = { position: [0, 42, 30] as const, fov: 50, lookAt: [0, 0, 0] as const };

/**
 * 堀大輔とのボス戦シーン (`?scene=boss`)。
 *
 * 1人ローカルで移動・攻撃・回避ができ、被弾でHPが減る (#55 / #56 / #58)。
 * アリーナの地形そのもの (境界・スポーン地点・装置アンカー) は #54 の
 * スコープで、ここは仮の平面。
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
      <BossArenaScene />
    </Canvas>
  );
}
