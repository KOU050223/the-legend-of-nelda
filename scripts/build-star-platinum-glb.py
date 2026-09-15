"""スタープラチナのリグ済みFBXをWeb表示用のGLBへ変換する。

入力: assets/character/star-platimun-low-poly/export/Neutral Idle.fbx
      (Mixamo Auto-Rigger でリグを付け、Neutral Idle を With Skin で
       ダウンロードしたもの。Standard Skeleton 65ボーンで、末端の leaf bone を
       除いた52ボーンを取り込む)
      + assets/character/star-platimun-low-poly/export/motions/ のモーションFBX
      + assets/character/star-platimun-low-poly/textures/*_baseColor.jpg
出力: public/models/star-platinum.glb

実行方法:

    blender --background --python scripts/build-star-platinum-glb.py

モーションはキャラ固有の `export/motions/` だけを見る。このキャラのリグは
Standard Skeleton (52ボーン) で、共有の `assets/motions/` が前提とする
`mixamorig:*` 33ボーンとは集合が一致しないため、共有側は使えない。

MixamoのFBXはルートに X軸90° の回転が乗ってくる。`assets/AGENTS.md` の
「新しくMixamo経由のモデルを足すときは、Blenderで回転・スケールを適用し、
実寸メートルへ揃えてから書き出す」に従い、ここで適用してから書き出す。
堀大輔のような正規化1.0の例外を増やさないため、表示側に姿勢依存の実測値を
持たせずに済む。

FBXにはマテリアルはあるがテクスチャが結び付いていないため、baseColor だけを
マテリアル名から対応付けて貼り直す。normal・occlusion・metallic・roughness は
含めない。normal 3枚だけで12.4MiBあり、他のキャラGLB (400〜520KiB) と桁が
変わるうえ、プレイヤーサイズの表示では効かない。
"""

from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parent.parent
CHARACTER = REPO / 'assets' / 'character' / 'star-platimun-low-poly'
SRC = CHARACTER / 'export' / 'Neutral Idle.fbx'
TEXTURES = CHARACTER / 'textures'
OUT = REPO / 'public' / 'models' / 'star-platinum.glb'

"""ベースFBXに同梱されているアクションのクリップ名。character-models.ts の
`clip` と一致させる。片方だけ変えるとクリップを引けなくなる。"""
BASE_CLIP = 'idle'

"""モーションFBXのファイル名 -> GLB内のクリップ名。
モーションを追加したら export/motions/ へ置き、ここへ足す。"""
MOTIONS: dict[str, str] = {
    'Punch Combo.fbx': 'punch',
}

MOTION_DIR = CHARACTER / 'export' / 'motions'

"""FBXインポート設定。ベースとモーションで必ず同じ値を使う。異なるスケールで
読むと Hips の location チャンネルだけ桁がずれ、キャラが沈む・飛ぶ。"""
FBX_IMPORT_KWARGS = {
    'global_scale': 1.0,
    'use_anim': True,
    'automatic_bone_orientation': False,
    'ignore_leaf_bones': True,
}

"""baseColor テクスチャの一辺の上限 (px)。元は2048前後あり、そのままだと
GLBが数MiBになる。プレイヤーサイズの表示なら1024で足りる。"""
MAX_TEXTURE_SIZE = 1024


def take_action(obj: bpy.types.Object) -> bpy.types.Action:
    """オブジェクトから再生中のアクションを1本だけ取り出す。"""
    anim = obj.animation_data
    if anim is None or anim.action is None:
        raise RuntimeError(f'{obj.name!r} has no action')
    action = anim.action
    anim.action = None
    return action


def stash(obj: bpy.types.Object, action: bpy.types.Action) -> None:
    """アクションをNLAトラックへ積む。エクスポータが全クリップを確実に拾う。"""
    anim = obj.animation_data or obj.animation_data_create()
    track = anim.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, int(action.frame_range[0]), action)
    track.mute = True


def remove_object_tree(obj: bpy.types.Object) -> None:
    for child in list(obj.children_recursive):
        bpy.data.objects.remove(child, do_unlink=True)
    bpy.data.objects.remove(obj, do_unlink=True)


def load_motion(base: bpy.types.Object, path: Path, clip_name: str) -> None:
    """モーションFBXを読み、アクションだけをベースArmatureへ移す。"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), **FBX_IMPORT_KWARGS)
    imported = [o for o in bpy.data.objects if o not in before]

    armatures = [o for o in imported if o.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'{path.name}: expected 1 armature, got {len(armatures)}')
    source = armatures[0]

    # ボーン名は両方向で一致させる。モーション側に余分があるとそのチャンネルが
    # 無視され、逆にベースのボーンが欠けていると、そのボーンだけバインドポーズの
    # まま取り残されて姿勢が壊れる。どちらも黙って通さない。
    base_bones = {b.name for b in base.data.bones}
    source_bones = {b.name for b in source.data.bones}
    if source_bones != base_bones:
        unknown = sorted(source_bones - base_bones)
        missing = sorted(base_bones - source_bones)
        raise RuntimeError(
            f'{path.name}: bone set differs from base rig'
            f' (not in base: {unknown}, missing from motion: {missing})'
        )

    action = take_action(source)
    action.name = clip_name
    stash(base, action)
    print(f'motion {clip_name!r} from {path.name} frames={tuple(action.frame_range)}')

    for obj in imported:
        if obj.name in bpy.data.objects:
            remove_object_tree(obj)


def bind_base_color(material: bpy.types.Material) -> None:
    """マテリアル名に対応する baseColor を Principled BSDF へ繋ぐ。"""
    texture = TEXTURES / f'{material.name}_baseColor.jpg'
    if not texture.exists():
        print(f'no baseColor for {material.name!r}')
        return

    image = bpy.data.images.load(str(texture))
    if max(image.size) > MAX_TEXTURE_SIZE:
        ratio = MAX_TEXTURE_SIZE / max(image.size)
        image.scale(int(image.size[0] * ratio), int(image.size[1] * ratio))

    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    material.node_tree.links.new(principled.inputs['Base Color'], node.outputs['Color'])
    print(f'bound {texture.name} {image.size[0]}x{image.size[1]} to {material.name!r}')


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(SRC), **FBX_IMPORT_KWARGS)

    # Maya由来の空Object (`group*` / `pSphere1` など) がFBXへ残っている。
    # 一部はスケールが 0 に近く、そのまま書き出すとthree.js側で逆行列の
    # 求まらない変換になる。リグとメッシュだけ残す。
    removed = 0
    for obj in list(bpy.data.objects):
        if obj.type not in {'ARMATURE', 'MESH'}:
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    print(f'removed {removed} non-mesh/armature objects')

    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if len(armatures) != 1:
        raise SystemExit(f'expected 1 armature, found {len(armatures)}')
    armature = armatures[0]
    print(f'armature {armature.name!r} bones={len(armature.data.bones)}')

    # Mixamo のルート回転 (X軸90°) を適用し、GLBの規約どおり素直な姿勢で
    # 書き出す。アニメーションを持つのでスケールは触らない (既に実寸メートル)。
    for obj in bpy.data.objects:
        obj.select_set(obj.type in {'ARMATURE', 'MESH'})
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Mixamo のアクション名は `Armature|mixamo.com|Layer0`。GLB側でクリップを
    # 名前で引くため、character-models.ts と揃えた名前へ変える。
    actions = list(bpy.data.actions)
    if len(actions) != 1:
        raise SystemExit(f'expected 1 action, found {[a.name for a in actions]}')
    print(f'renaming action {actions[0].name!r} -> {BASE_CLIP!r}')
    base_action = actions[0]
    base_action.name = BASE_CLIP
    # ベースのアクションもNLAへ積む。直接再生中のものとNLAが混ざると、
    # エクスポータがどちらか一方しか拾わないことがある。
    take_action(armature)
    stash(armature, base_action)

    for filename, clip_name in MOTIONS.items():
        path = MOTION_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f'motion fbx not found: {path.relative_to(REPO)}')
        load_motion(armature, path, clip_name)

    for material in bpy.data.materials:
        bind_base_color(material)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format='GLB',
        export_apply=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_skins=True,
        export_cameras=False,
        export_lights=False,
        export_image_format='JPEG',
        export_yup=True,
    )
    print('wrote', OUT, f'{OUT.stat().st_size / 1024 / 1024:.2f} MiB')


main()
