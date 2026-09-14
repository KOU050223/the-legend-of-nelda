"""堀大輔のリグ済みFBXとMixamoモーションFBX群を1つのGLBへまとめる。

ベース: assets/character/hori-daisuke-v1/export/hori-daisuke-rigged-zombie-stand-up.fbx
        (Hori Daisuke v4 モデル + Mixamo 33ボーンリグ + Zombie Stand Up アニメ)
追加  : Mixamo から Without Skin で落としたモーションのみのFBX。次の順で探す。
        1. assets/motions/                                  (全キャラ共有)
        2. assets/character/hori-daisuke-v1/export/motions/  (堀大輔専用)
出力  : public/models/hori-daisuke.glb

Mixamo のリグは `mixamorig:*` で共通なので、歩く・走るのような汎用モーションは
キャラに紐づかない。共有側に置いて他のキャラからも同じFBXを使う。ボス専用の
攻撃モーションのように流用の余地がないものだけキャラ側に置く。

Mixamo のアクションは全て `mixamo.com` 系の同じ名前で入ってくるため、読み込んだ
直後に MOTIONS のクリップ名へ改名する。改名しないと2本目以降が `mixamo.com.001`
になり、GLB側でクリップを名前で引けなくなる。

モーションFBX側のArmatureはアクションを剥がしたら捨てる。ベースFBXのArmatureへ
アクションを付け替え、NLAへスタッシュしてからまとめて書き出す。ボーン名が揃って
いる前提で、揃わないものはエラーにする。

実行方法:

    blender --background --python scripts/build-hori-daisuke-glb.py
"""

from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parent.parent
CHARACTER = REPO / 'assets' / 'character' / 'hori-daisuke-v1' / 'export'
BASE_FBX = CHARACTER / 'hori-daisuke-rigged-zombie-stand-up.fbx'
OUT = REPO / 'public' / 'models' / 'hori-daisuke.glb'

# モーションFBXを探す場所。共有を先に見る。
MOTION_DIRS = (REPO / 'assets' / 'motions', CHARACTER / 'motions')

# ベースFBXに同梱されているアクションのクリップ名。
BASE_CLIP = 'stand-up'

# モーションFBXのファイル名 -> GLB内のクリップ名。ファイル名は MOTION_DIRS から
# 探すので、共有・キャラ固有のどちらに置いたかをここへ書く必要はない。
# src/rendering/character/horiDaisukeMotions.ts の MOTION_CLIPS と対応させる。
# モーションFBXを追加したら、ここにファイル名とクリップ名を足す。
MOTIONS: dict[str, str] = {
    'walking.fbx': 'walk',
}

# FBXインポート設定。ベースとモーションで必ず同じ値を使う。異なるスケールで読むと
# Hips の location チャンネルだけ桁がずれ、キャラが沈む・飛ぶ。
FBX_IMPORT_KWARGS = {
    'global_scale': 1.0,
    'use_anim': True,
    'automatic_bone_orientation': False,
}


def import_fbx(path: Path) -> None:
    bpy.ops.import_scene.fbx(filepath=str(path), **FBX_IMPORT_KWARGS)


def sole_armature_object() -> bpy.types.Object:
    """シーン内で唯一のArmatureオブジェクトを返す。複数あれば構成の想定外。"""
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if len(armatures) != 1:
        names = [o.name for o in armatures]
        raise RuntimeError(f'expected exactly 1 armature, got {names}')
    return armatures[0]


def take_action(obj: bpy.types.Object) -> bpy.types.Action:
    """オブジェクトから再生中のアクションを1本だけ取り出す。"""
    anim = obj.animation_data
    if anim is None or anim.action is None:
        raise RuntimeError(f'{obj.name!r} has no action')
    action = anim.action
    anim.action = None
    return action


def remove_object_tree(obj: bpy.types.Object) -> None:
    for child in list(obj.children_recursive):
        bpy.data.objects.remove(child, do_unlink=True)
    bpy.data.objects.remove(obj, do_unlink=True)


def stash(obj: bpy.types.Object, action: bpy.types.Action) -> None:
    """アクションをNLAトラックへ積む。エクスポータが全クリップを確実に拾う。"""
    anim = obj.animation_data or obj.animation_data_create()
    track = anim.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, int(action.frame_range[0]), action)
    track.mute = True


def find_motion(filename: str) -> Path:
    """モーションFBXを MOTION_DIRS から探す。共有を優先し、無ければキャラ固有。"""
    for directory in MOTION_DIRS:
        path = directory / filename
        if path.exists():
            return path
    searched = ', '.join(str(d.relative_to(REPO)) for d in MOTION_DIRS)
    raise FileNotFoundError(f'motion fbx {filename!r} not found in: {searched}')


def load_motion(base: bpy.types.Object, path: Path, clip_name: str) -> None:
    """モーションFBXを読み、アクションだけをベースArmatureへ移す。"""
    before = set(bpy.data.objects)
    import_fbx(path)
    imported = [o for o in bpy.data.objects if o not in before]

    armatures = [o for o in imported if o.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'{path.name}: expected 1 armature, got {len(armatures)}')
    source = armatures[0]

    base_bones = {b.name for b in base.data.bones}
    missing = sorted({b.name for b in source.data.bones} - base_bones)
    if missing:
        raise RuntimeError(f'{path.name}: bones not in base rig: {missing}')

    action = take_action(source)
    action.name = clip_name
    stash(base, action)

    print(f'motion {clip_name!r} from {path.name} frames={tuple(action.frame_range)}')

    for obj in imported:
        if obj.name in bpy.data.objects:
            remove_object_tree(obj)


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_fbx(BASE_FBX)

    # ベースFBXにはBlender書き出し用のライト・カメラが同梱される。ゲームでは使わない。
    removed = 0
    for obj in list(bpy.data.objects):
        if obj.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    print(f'removed {removed} cameras/lights')

    base = sole_armature_object()
    print(f'base rig {base.data.name!r} bones={len(base.data.bones)}')

    base_action = take_action(base)
    base_action.name = BASE_CLIP
    stash(base, base_action)
    print(f'motion {BASE_CLIP!r} from {BASE_FBX.name} frames={tuple(base_action.frame_range)}')

    for filename, clip_name in MOTIONS.items():
        load_motion(base, find_motion(filename), clip_name)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
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
    print('exported clips', clips)
    print('wrote', OUT, f'{OUT.stat().st_size / 1024 / 1024:.2f} MiB')


main()
