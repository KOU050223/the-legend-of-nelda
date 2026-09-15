import { describe, expect, it } from 'vitest';
import {
  Bone,
  BoxGeometry,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  type Object3D,
} from 'three';

import { cloneModelForScene, prepareClonedModel } from './cloned-model';

/**
 * GLBのリグ構造 (Scene → Armature → [Bone, SkinnedMesh]) を模した最小モデル。
 */
function buildRiggedFigure(): { scene: Group } {
  const bone = new Bone();
  bone.name = 'rootBone';

  const mesh = new SkinnedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.name = 'figure';

  const armature = new Group();
  armature.name = 'Armature';
  armature.add(bone);
  armature.add(mesh);

  const scene = new Group();
  scene.name = 'Scene';
  scene.add(armature);

  mesh.bind(new Skeleton([bone]));
  return { scene };
}

function skinnedMeshOf(root: Object3D): SkinnedMesh {
  const found: SkinnedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) found.push(object);
  });
  const mesh = found[0];
  if (mesh === undefined) throw new Error('SkinnedMesh がない');
  return mesh;
}

describe('cloneModelForScene', () => {
  it('複製モデルのボーンが親 (Character Root) の移動へ追従する', () => {
    const clone = cloneModelForScene(buildRiggedFigure().scene);
    const mesh = skinnedMeshOf(clone);

    const parent = new Group();
    parent.add(clone);
    parent.position.set(5, 0, -3);
    parent.updateMatrixWorld(true);

    // drei の <Clone> は primitive 化したボーンが再レンダーでツリーから外れ、
    // モデルがマウント位置に凍結した。ボーンがツリー内に残ることが
    // 「モデルもHPバーと一緒に動く」の前提なので、ここで固定する。
    const bone = mesh.skeleton.bones[0];
    expect(bone).toBeDefined();
    expect(bone?.parent).not.toBeNull();
    expect(bone?.matrixWorld.elements[12]).toBeCloseTo(5);
    expect(bone?.matrixWorld.elements[14]).toBeCloseTo(-3);
  });
});

describe('prepareClonedModel', () => {
  it('カメラに近いキャラも消えないよう、カリングを切り影を落とす', () => {
    const clone = cloneModelForScene(buildRiggedFigure().scene);
    const mesh = skinnedMeshOf(clone);

    prepareClonedModel(clone);

    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(true);
  });
});
