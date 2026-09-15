import { Mesh, type Object3D } from 'three';

/**
 * SkinnedMesh の視錐台カリングを切る。
 *
 * three.js は SkinnedMesh の境界球をバインドポーズから一度だけ求め、毎フレーム
 * 計算し直さない。このゲームのGLBは境界球が
 *
 * - **部位ごとに小さい** (眉だけで半径0.012、腕で0.16)
 * - **表示スケールが乗る前の値** (ボスは 2.4/0.762 ≈ 3.15倍して描く)
 *
 * という二重の意味で実際の見た目とずれている。そのためカメラが近づくと、
 * まだ画面に映っているのに「範囲外」と判定され、部位単位でごっそり消える。
 * ボスへ寄ると体が消えてHPバーだけが残る、という見え方になる。
 *
 * 境界球を毎フレーム計算し直す手もあるが、メッシュ数が多く (ボスは224個)
 * 毎フレームでは割に合わない。キャラは常に画面近くに居てカリングで得られる
 * ものが無いため、単に切る。
 */
export function disableSkinnedCulling(root: Object3D | null): void {
  root?.traverse((object) => {
    if (object instanceof Mesh) object.frustumCulled = false;
  });
}
