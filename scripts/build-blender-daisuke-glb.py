"""オドルノDaisuke と Pay大輔のリグ済みFBXとモーションを1つのGLBへまとめる。

実行方法:

    blender --background --python scripts/build-blender-daisuke-glb.py

ベース: assets/character/<キャラ>/export/<キャラ>-for-mixamo.fbx
        (Mixamo Auto-Rigger でリグを付けたもの。33ボーン)
追加  : Without Skin で落としたモーションFBX。次の順で探す。
        1. assets/motions/                       (全キャラ共有)
        2. assets/character/<キャラ>/export/motions/  (キャラ固有)
出力  : public/models/<キャラ>.glb

2体はモデルもリグも同じ作り方なので、1本のスクリプトで両方を作る。
クリップ定義は `assets/motion-manifest.json` が持つ (docs/motion-manifest.md)。

**このスクリプトは回転とスケールの両方を適用する。** Mixamo のFBXは
cm単位・Z-up で来るため、ルートに `rotation`(X軸90°) と `scale`(0.01) が
乗っている。これを残したまま書き出すと `hori-daisuke.glb` と同じ状態になり、
表示側が姿勢依存の実測値 (`MODEL_STANDING_HEIGHT = 0.762`) を抱えることに
なる (`assets/AGENTS.md` の「例外」)。ここで適用して実寸メートルへ揃え、
マニフェストの `standingHeight` (1.809 / 1.902) がそのまま使えるようにする。
"""

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from motion_manifest import load_model  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

# 作るモデル。マニフェストのキーと、ベースFBXの場所。
TARGETS = ('dance-daisuke', 'paypay-daisuke')

# ベースFBX。**Mixamo から With Skin で落としたモーション**を使う。
# Auto-Rigger のキャラ出力ではない。star-platinum (`Neutral Idle.fbx`) と
# hori (`...rigged-zombie-stand-up.fbx`) も同じ形で、ベース自体がクリップを
# 1本持っている。それを `baseClip` の名前へ改名して使う。
BASE_FBX = {
    'dance-daisuke': REPO / 'assets/character/dance-daisuke/export/dance-daisuke.fbx',
    'paypay-daisuke': REPO / 'assets/character/paypay-daisuke-v1/export/paypay-daisuke.fbx',
}

# FBXインポート設定。ベースとモーションで必ず同じ値を使う。異なるスケールで読むと
# Hips の location チャンネルだけ桁がずれ、キャラが沈む・飛ぶ。
# 胴の長さがこの割合まで近ければ「同じ骨格」とみなし、位置チャンネルを
# そのまま使う。超えたら回転だけを移す。
TORSO_TOLERANCE = 0.02

FBX_IMPORT_KWARGS = {
    'global_scale': 1.0,
    'use_anim': True,
    'automatic_bone_orientation': False,
}


def sole_armature() -> bpy.types.Object:
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'expected exactly 1 armature, got {[o.name for o in armatures]}')
    return armatures[0]


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


def find_motion(model_id: str, filename: str) -> Path:
    """モーションFBXを探す。共有を優先し、無ければキャラ固有。"""
    for directory in (REPO / 'assets' / 'motions', BASE_FBX[model_id].parent / 'motions'):
        path = directory / filename
        if path.exists():
            return path
    raise FileNotFoundError(f'motion fbx {filename!r} not found for {model_id}')


def torso_length(armature: bpy.types.Object) -> float:
    """腰から頭までの長さ。骨格の寸法が揃っているかの目安にする。"""
    bones = armature.data.bones
    return bones['mixamorig:Head'].head_local.y - bones['mixamorig:Hips'].head_local.y


def drop_bone_locations(action: bpy.types.Action) -> int:
    """Hips以外のボーンの位置チャンネルを捨てる。

    Mixamo のモーションは34本すべてのボーンに location を焼き込んでくる。
    その値は**元になったキャラの骨格の寸法**なので、骨の長さが違うリグへ
    そのまま当てると壊れる (腕が胴から2m離れた)。

    dance/paypay は Auto-Rigger がメッシュの実寸 (1.8m級) に合わせて骨を
    組んだため、モーション側 (正規化された骨格) と胴の長さが1.5倍以上違う。
    比率で伸ばして辻褄を合わせようとしても、骨ごとに比率が違うので直らない。

    **回転だけを移す。** 回転は骨格の寸法に依らないので、そのまま当てて
    正しい姿勢になる。各ボーンはレスト姿勢の位置に留まり、そこから回る。
    腰の移動 (Hips) は上下の沈み込みなど動きの要なので残す。

    hori は元が正規化スケールで寸法が揃っているため、この処理は要らない
    (あちらのビルドスクリプトは触っていない)。star は素材と同じキャラから
    モーションを落としているのでそもそも揃う。
    """
    channelbag = action.layers[0].strips[0].channelbag(action.slots[0])
    doomed = [
        fcurve
        for fcurve in channelbag.fcurves
        if '.location' in fcurve.data_path and '"mixamorig:Hips"' not in fcurve.data_path
    ]
    for fcurve in doomed:
        channelbag.fcurves.remove(fcurve)

    return len(doomed)


def scale_location_keys(action: bpy.types.Action, scale: 'bpy.types.bpy_prop_array') -> None:
    """アクションの位置キーをオブジェクトスケールに合わせて縮める。

    `object.transform_apply(scale=True)` はボーンのレスト位置は直すが、
    ポーズの位置キーは触らない。Mixamo のFBXは cm 空間の値を持っているので、
    メートルへ揃えたあとは同じ比率でキーも縮めないと桁がずれる。
    """
    channelbag = action.layers[0].strips[0].channelbag(action.slots[0])
    for fcurve in channelbag.fcurves:
        if '.location' not in fcurve.data_path:
            continue

        factor = scale[fcurve.array_index]
        for key in fcurve.keyframe_points:
            key.co.y *= factor
            key.handle_left.y *= factor
            key.handle_right.y *= factor


def load_motion(base: bpy.types.Object, path: Path, clip_name: str) -> None:
    """モーションFBXを読み、アクションだけをベースArmatureへ移す。"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), **FBX_IMPORT_KWARGS)
    imported = [o for o in bpy.data.objects if o not in before]

    armatures = [o for o in imported if o.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'{path.name}: expected 1 armature, got {len(armatures)}')
    source = armatures[0]

    # ボーン名は両方向で一致させる。過不足があると、そのボーンだけバインド
    # ポーズのまま取り残されて姿勢が壊れる。揃わないFBXは
    # `scripts/align-motion-rig.py` で基準リグへ寄せる。
    base_bones = {b.name for b in base.data.bones}
    source_bones = {b.name for b in source.data.bones}
    if source_bones != base_bones:
        unknown = sorted(source_bones - base_bones)
        missing = sorted(base_bones - source_bones)
        raise RuntimeError(
            f'{path.name}: bone set differs from base rig'
            f' (not in base: {unknown}, missing from motion: {missing})'
        )

    # 名前が揃っていても骨格の寸法が違うと、位置チャンネルがそのままでは
    # 使えない。胴の長さの比で揃える。
    base_torso = torso_length(base)
    source_torso = torso_length(source)

    action = take_action(source)
    action.name = clip_name

    # 骨格の寸法が揃っていれば位置チャンネルはそのまま使える。むしろ捨てると
    # 骨の長さが保てず、肩が膨らんで腕が縮む。寸法が違うときだけ捨てる。
    gap = abs(base_torso - source_torso) / max(source_torso, 1e-9)
    if gap <= TORSO_TOLERANCE:
        note = f'胴が一致 (差{gap:.1%})'
    else:
        note = f'胴が違う (base={base_torso:.1f} motion={source_torso:.1f} 差{gap:.1%}) 位置{drop_bone_locations(action)}本を除去'

    stash(base, action)
    print(f'  motion {clip_name!r} from {path.name} frames={tuple(action.frame_range)} {note}')

    for obj in imported:
        if obj.name in bpy.data.objects:
            remove_object_tree(obj)


def build(model_id: str) -> None:
    model = load_model(model_id)
    base_clip = model['build']['baseClip']
    motions = model['build']['sources']
    out = REPO / 'public' / 'models' / f'{model_id}.glb'

    print(f'=== {model_id}')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(BASE_FBX[model_id]), **FBX_IMPORT_KWARGS)

    for obj in list(bpy.data.objects):
        if obj.type not in {'ARMATURE', 'MESH'}:
            bpy.data.objects.remove(obj, do_unlink=True)

    armature = sole_armature()
    print(f'  base rig bones={len(armature.data.bones)}')

    # ベースFBXに同梱されているアクションを baseClip として使う
    # (star-platinum / hori と同じ形)。Mixamo のアクション名は
    # `Armature|mixamo.com|Layer0` なので、クリップ名へ改名する。
    base_action = take_action(armature)
    base_action.name = base_clip
    stash(armature, base_action)
    print(f'  motion {base_clip!r} from {BASE_FBX[model_id].name} frames={tuple(base_action.frame_range)}')

    for filename, clip_name in motions.items():
        load_motion(armature, find_motion(model_id, filename), clip_name)

    # Mixamo のルート回転(X軸90°)とスケール(0.01)を適用する。残したまま出すと
    # hori-daisuke.glb と同じ、正規化スケールのGLBになる (assets/AGENTS.md)。
    applied_scale = armature.scale.copy()
    for obj in bpy.data.objects:
        obj.select_set(obj.type in {'ARMATURE', 'MESH'})
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # `transform_apply` はボーンの長さは直すが、**アクションの位置キーは
    # そのまま**残す。キーはFBXのcm空間の値なので、スケールを適用した後の
    # メートル空間では桁がずれる (Hips が左右に10m振れ、地面へ沈んだ)。
    # 適用したスケールと同じ比率でキーも縮める。
    for action in bpy.data.actions:
        scale_location_keys(action, applied_scale)

    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format='GLB',
        export_apply=False,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_skins=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    clips = sorted(a.name for a in bpy.data.actions)
    print(f'  exported clips {clips}')
    print(f'  wrote {out.name} {out.stat().st_size / 1024 / 1024:.2f} MiB')


def main() -> None:
    for model_id in TARGETS:
        build(model_id)


main()
