"""Blender製キャラクターを Mixamo Auto-Rigger へアップロードできる形にする。

対象: オドルノDaisuke (dance-daisuke) と Pay大輔 (paypay-daisuke)

実行方法:

    blender --background --python scripts/prepare-for-mixamo.py

出力:

    assets/character/dance-daisuke/export/dance-daisuke-for-mixamo.fbx
    assets/character/paypay-daisuke-v1/export/paypay-daisuke-for-mixamo.fbx

Auto-Rigger は **GLBを受け付けない**。GLBを投げると
`ERROR on mapping character: Unexpected File Type.` になる。受け付けるのは
FBX / OBJ / ZIP なので、FBXで出す。

`.blend` を入力にするのは、GLBがすでに Y-up へ変換済みで、戻す手間が要るため。
`.blend` はメッシュの素の状態 (Z-up・正面 -Y) を持っている。

ここでやること:

1. **既存のリグを外す。** 2体とも自前のリグを持っている。Auto-Rigger が
   欲しいのは素のジオメトリなので、アーマチュアとモディファイア、頂点
   グループを外してレスト姿勢の形だけを残す。star-platinum は元からリグが
   無かったので、この手順が要らなかった
   (`scripts/prepare-star-platinum-for-mixamo.py`)。

2. **腕を開く。** どちらもレスト姿勢は真下から約28度しかないきついAポーズ
   で、Auto-Rigger が腕と胴を切り分けにくい。左右へ開いて、より水平に近い
   Aポーズへ寄せる。Tポーズちょうどにはしない。Auto-Rigger は緩いAポーズも
   受け付けるうえ、肩の形が崩れにくい。

   どの頂点が腕かは**既存リグのウェイトから拾う**。座標で当てようとすると
   ズボンの裾や腰まで巻き込む (実際、脚が円錐状に開き、腰が横へ張り出した)。
   そのため、リグを外すのはウェイトを読んだあとにする。

   肩の位置もリグから読む。2体で少しずれており (Z=1.290 と 1.292)、
   決め打ちにすると回転の中心がずれる。

メッシュは2体とも1つなので、star のような結合は要らない。

アップロードしたあとの手順は
[`docs/motion-manifest.md`](../docs/motion-manifest.md) を参照する。
"""

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

REPO = Path(__file__).resolve().parent.parent

# 下ごしらえするモデル。`.blend` とメッシュ名、出力先。
TARGETS = (
    {
        'label': 'dance-daisuke',
        'blend': REPO / 'assets/character/dance-daisuke/blender/dance-daisuke.blend',
        'mesh': 'DanceDaisuke_Mesh',
        'out': REPO / 'assets/character/dance-daisuke/export/dance-daisuke-for-mixamo.fbx',
    },
    {
        'label': 'paypay-daisuke',
        'blend': REPO / 'assets/character/paypay-daisuke-v1/blender/paypay-daisuke.blend',
        'mesh': 'Daisuke_Character',
        'out': REPO / 'assets/character/paypay-daisuke-v1/export/paypay-daisuke-for-mixamo.fbx',
    },
)

# 腕を開く角度。**0 にしてある。**
#
# 当初は Auto-Rigger が腕と胴を切り分けやすいよう28度開いていたが、
# **開いた状態で上げると Auto-Rigger が肘の位置を読み違える**。
# 前腕/上腕の比が元の 0.89 から 1.26 へ狂い、前腕だけが伸びて袖が肘で
# 途切れる見た目になった (Issue #98)。
#
# 元のレスト姿勢は真下から約28度のAポーズで、腕と胴のあいだには
# 0.15m の隙間がある。Auto-Rigger はこのままで切り分けられる。
# オラ大輔はほぼT字(7.2度)で問題なくリグが付いており、角度そのものが
# 要件なのではない。触らずに渡すのが一番安全。
ARM_LIFT_DEGREES = 0.0

# 腕の頂点を決めるボーン名。
ARM_BONES = ('UpperArm', 'Forearm', 'Hand')

# 回転の中心にする肩のボーン。左右対称なので片側だけ読む。
SHOULDER_BONE = 'UpperArm.L'

# ウェイトがこれ以上なら腕とみなす。肩の境目の頂点は胴と分け合うため、
# 主に腕へ属するものだけを回す。
ARM_MIN_WEIGHT = 0.5


def shoulder_of(armature: bpy.types.Object) -> Vector:
    """回転の中心にする肩の位置をリグから読む。"""
    bone = armature.data.bones.get(SHOULDER_BONE)
    if bone is None:
        raise RuntimeError(f'{SHOULDER_BONE!r} not found in {armature.name!r}')

    return Vector(bone.head_local)


def arm_vertex_indices(mesh: bpy.types.Object) -> set[int]:
    """既存リグのウェイトから腕の頂点を拾う。

    どの頂点が腕かはモデル自身が知っている。座標で当てるより確実で、
    ズボンや腰を巻き込まない。
    """
    groups = {
        group.index
        for group in mesh.vertex_groups
        if any(bone in group.name for bone in ARM_BONES)
    }
    if not groups:
        raise RuntimeError(f'no arm vertex groups matching {ARM_BONES}')

    return {
        vertex.index
        for vertex in mesh.data.vertices
        if any(g.group in groups and g.weight >= ARM_MIN_WEIGHT for g in vertex.groups)
    }


def lift_arms(mesh: bpy.types.Object, indices: set[int], shoulder: Vector) -> None:
    """肩を中心に腕を左右へ開く。

    ボーンではなく頂点を直接動かす。リグを外すので、残るのはメッシュの形
    そのものだけ。左右を独立に、それぞれの肩を中心に回す。
    """
    angle = math.radians(ARM_LIFT_DEGREES)

    for index in indices:
        vertex = mesh.data.vertices[index]
        co = vertex.co
        side = 1.0 if co.x > 0 else -1.0
        # Y軸まわりに回すと、腕が上下(Z)と左右(X)の面内で動く。
        # 右腕(-X)と左腕(+X)で回す向きが逆になる。
        pivot = Vector((shoulder.x * side, shoulder.y, shoulder.z))
        vertex.co = pivot + Matrix.Rotation(-angle * side, 3, 'Y') @ (co - pivot)


def prepare(label: str, blend: Path, mesh_name: str, out: Path) -> None:
    bpy.ops.wm.open_mainfile(filepath=str(blend))

    mesh = bpy.data.objects.get(mesh_name)
    if mesh is None:
        raise RuntimeError(f'{mesh_name!r} not found in {blend.name}')

    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'{blend.name}: expected 1 armature, got {len(armatures)}')
    shoulder = shoulder_of(armatures[0])

    # 腕はウェイトで選ぶので、頂点グループを捨てる前に読む。
    arms = arm_vertex_indices(mesh)
    lift_arms(mesh, arms, shoulder)
    print(f'[{label}] lifted {len(arms)} arm vertices by {ARM_LIFT_DEGREES} deg')

    for modifier in list(mesh.modifiers):
        if modifier.type == 'ARMATURE':
            name = modifier.name
            mesh.modifiers.remove(modifier)
            print(f'[{label}] removed armature modifier {name!r}')

    groups = len(mesh.vertex_groups)
    mesh.vertex_groups.clear()
    print(f'[{label}] cleared {groups} vertex groups')

    # メッシュ以外 (リグ・カメラ・ライト・床) は全部捨てる。
    removed = 0
    for obj in list(bpy.data.objects):
        if obj.name != mesh_name:
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    print(f'[{label}] removed {removed} non-mesh objects')

    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=str(out),
        use_selection=False,
        object_types={'MESH'},
        add_leaf_bones=False,
        bake_anim=False,
    )
    print(f'[{label}] wrote {out} {out.stat().st_size / 1024:.0f} KiB')


def main() -> None:
    for target in TARGETS:
        prepare(target['label'], target['blend'], target['mesh'], target['out'])


main()
