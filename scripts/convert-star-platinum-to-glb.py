"""スタープラチナのFBXをWeb表示用のGLBへ変換する。

入力: assets/character/star-platimun-low-poly/export/star-platimun-low-poly.fbx
      + assets/character/star-platimun-low-poly/textures/*_baseColor.jpg
出力: public/models/star-platinum.glb

FBXはMaya由来で、変換に不要なものを多く含む。実行方法:

    blender --background --python scripts/convert-star-platinum-to-glb.py

落とすもの:

- 空Object (`pasted__*` など約80個)。Maya のグループ階層の残骸で、
  `ojos` / `pCylinder1` / `pSphere1` はスケールが 0 のため、そのまま
  書き出すと three.js 側で逆行列の求まらない変換になる。
- baseColor 以外のテクスチャ (normal / occlusion / metallic / roughness)。
  normal 3枚だけで 12.4MiB あり、他のキャラGLB (400〜520KiB) と桁が変わる。
  グレーボックスのアリーナに立つプレイヤーサイズの表示では効かない。

FBXはマテリアルを持つがテクスチャが結び付いていないため、baseColor だけを
マテリアル名から対応付けて貼り直す。
"""

from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parent.parent
CHARACTER = REPO / 'assets' / 'character' / 'star-platimun-low-poly'
SRC = CHARACTER / 'export' / 'star-platimun-low-poly.fbx'
TEXTURES = CHARACTER / 'textures'
OUT = REPO / 'public' / 'models' / 'star-platinum.glb'

"""baseColor テクスチャの一辺の上限 (px)。元は 2048 前後あり、そのままだと
GLBが数MiBになる。プレイヤーサイズの表示なら 1024 で足りる。"""
MAX_TEXTURE_SIZE = 1024


def bind_base_color(material: bpy.types.Material) -> bool:
    """マテリアル名に対応する baseColor を Principled BSDF へ繋ぐ。"""
    texture = TEXTURES / f'{material.name}_baseColor.jpg'
    if not texture.exists():
        print(f'no baseColor for {material.name!r}')
        return False

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
    return True


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(SRC))

    # Object単位のスケールがメッシュごとに違う (0.01 と 0.382)。親を外して
    # スケールを適用し、GLB上は素直な1段の階層にする。
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    removed = 0
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    print(f'removed {removed} non-mesh objects')

    for material in bpy.data.materials:
        bind_base_color(material)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format='GLB',
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        export_image_format='JPEG',
        export_yup=True,
    )
    print('wrote', OUT, f'{OUT.stat().st_size / 1024 / 1024:.2f} MiB')


main()
