"""スタープラチナのFBXを Mixamo Auto-Rigger へアップロードできる形にする。

入力: assets/character/star-platimun-low-poly/export/star-platimun-low-poly.fbx
出力: assets/character/star-platimun-low-poly/export/star-platimun-for-mixamo.fbx

実行方法:

    blender --background --python scripts/prepare-star-platinum-for-mixamo.py

Mixamo の Auto-Rigger は**1つのメッシュ**しか受け付けない。元FBXは
`cuerpo1` / `pelo` / `ropa` の3つに分かれているため結合する。メッシュは
Tポーズで、これは Auto-Rigger が想定する姿勢そのものなので姿勢は触らない。

境界エッジ (3メッシュ合計で約7,700) は、鎧・ブーツ・髪のように重なった
シェルで作られたゲーム用アセットでは普通の状態。Auto-Rigger はシルエットと
マーカー位置からスケルトンを合わせるので、この形のままで問題ない。

書き出したFBXの使い方は
`assets/character/star-platimun-low-poly/README.md` を参照する。
"""

from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parent.parent
CHARACTER = REPO / 'assets' / 'character' / 'star-platimun-low-poly'
SRC = CHARACTER / 'export' / 'star-platimun-low-poly.fbx'
OUT = CHARACTER / 'export' / 'star-platimun-for-mixamo.fbx'


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(SRC))

    # Object単位のスケールがメッシュごとに違う (0.01 と 0.382)。親を外して
    # スケールを適用しないと、結合したときに部位ごとの大きさが崩れる。
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Auto-Rigger は1メッシュしか受け付けないため結合する。
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = 'StarPlatinum'
    print(f'joined {len(meshes)} meshes into {joined.name!r}')

    removed = 0
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    print(f'removed {removed} non-mesh objects')

    bpy.ops.export_scene.fbx(
        filepath=str(OUT),
        use_selection=False,
        object_types={'MESH'},
        add_leaf_bones=False,
        bake_anim=False,
    )
    print('wrote', OUT, f'{OUT.stat().st_size / 1024 / 1024:.2f} MiB')


main()
