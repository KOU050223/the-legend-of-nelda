import { Mesh, type Object3D } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * useGLTF の scene を表示用に複製する。
 *
 * drei の `<Clone>` は使わない。`<Clone>` はリグ入りモデルを
 * `<primitive>` (実インスタンス) と再構築要素 (`<group>` など) の組へ
 * 分解して出し直す。ボーンは primitive として r3f 側の Object3D へ
 * 付け替えられ、そのとき複製テンプレートの `children` 配列からボーンが
 * 消える。次の React の再レンダーで `<Clone>` が `object.children` を
 * 読み直すとボーンの要素が無いため、React はボーンの primitive を
 * 削除する。こうしてボーンがシーングラフから外れ、SkinnedMesh の頂点は
 * 「外れた時点のボーン行列」で凍結する (モデルだけが移動へ追従せず、
 * HPバーだけが動く、という見え方になる)。
 *
 * `<primitive>` で複製ルートを丸ごとツリーへ入れれば、ボーンは複製内の
 * Armature の子として残り、親 (Character Root) の移動にそのまま追従する。
 */
export function cloneModelForScene(scene: Object3D): Object3D {
  return cloneSkeleton(scene);
}

/**
 * 複製したモデルの表示フラグを一括で整える。`<primitive>` の ref から呼ぶ。
 *
 * SkinnedMesh の視錐台カリングを切る。three.js は SkinnedMesh の境界球を
 * バインドポーズから一度だけ求め、毎フレーム計算し直さない。このゲームの
 * GLB は境界球が
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
 *
 * castShadow は <Clone> に渡していた `castShadow` の代替。primitive には
 * props で渡せず、ルートへ立てても子へ伝わらないため、ここで各メッシュへ
 * 立てる。
 */
export function prepareClonedModel(root: Object3D | null): void {
  root?.traverse((object) => {
    if (object instanceof Mesh) {
      object.frustumCulled = false;
      object.castShadow = true;
    }
  });
}
