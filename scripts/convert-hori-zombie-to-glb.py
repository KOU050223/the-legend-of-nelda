"""堀大輔のリグ済みFBXをWeb表示用のGLBへ変換する。

入力: assets/character/hori-daisuke-v1/export/hori-daisuke-rigged-zombie-stand-up.fbx
      (Hori Daisuke v4 モデル + Mixamo リグ + Zombie Stand Up アニメ)
出力: public/models/hori-daisuke.glb

FBXに同梱されるBlender書き出し用のライト・カメラはゲームでは使わないため落とす。
リグ・メッシュ・アニメーションだけを残す。実行方法:

    blender --background --python scripts/convert-hori-zombie-to-glb.py
"""

from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parent.parent
SRC = (
    REPO
    / 'assets'
    / 'character'
    / 'hori-daisuke-v1'
    / 'export'
    / 'hori-daisuke-rigged-zombie-stand-up.fbx'
)
OUT = REPO / 'public' / 'models' / 'hori-daisuke.glb'


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(SRC))

    removed = 0
    for obj in list(bpy.data.objects):
        if obj.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    print(f'removed {removed} cameras/lights')

    for armature in bpy.data.armatures:
        print(f'armature {armature.name!r} bones={len(armature.bones)}')
    print('actions', [a.name for a in bpy.data.actions])

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
    print('wrote', OUT, f'{OUT.stat().st_size / 1024 / 1024:.2f} MiB')


main()
