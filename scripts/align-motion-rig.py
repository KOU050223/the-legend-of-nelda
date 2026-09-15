"""モーションFBXのボーンを、このリポジトリの基準リグへ揃える。

実行方法:

    blender --background --python scripts/align-motion-rig.py -- <fbx> [<fbx> ...]

Mixamo の Auto-Rigger は設定によって骨格が変わる。ダウンロードしたモーションの
骨格は**そのとき選ばれていたキャラのもの**なので、指の有無が違うキャラで
落とすと噛み合わなくなる。実際、親指付き(41)のモーションが、親指なし(33)の
リグへ載らなかった。

ビルドスクリプトはボーンの集合が完全一致することを要求する。過不足があると、
そのボーンだけバインドポーズに取り残されて姿勢が壊れるため
(`assets/AGENTS.md`)。そこで、多い側から余分を削って揃える。

**基準は33ボーン。** このリポジトリの資産はすべてこの集合で揃っている:

- `assets/motions/walking.fbx`, `Sleeping Idle.fbx`
- `dance-daisuke` / `paypay-daisuke` の Auto-Rig 済みFBX
- `hori-daisuke-rigged-zombie-stand-up.fbx` (horiのビルド基準)

削るボーンは名前で決め打ちしない。基準の集合に無いものを削る。名前で
決めると、`Middle` のような語が背骨の名前にも当たって削りすぎる
(実際 41 -> 25 になった)。指のうち Index は基準に**含まれる**ので、
「指だから削る」という判断自体が誤り。

削れるのは末端の枝だけ。基準に無いボーンが基準のボーンの親になっている
場合は、削ると親子関係が壊れるのでエラーにする。

**上書きする。** 実行前にコミットしておくか、元を残したい場合はコピーを取る。
"""

import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parent.parent

# 基準リグを持つFBX。ここからボーン名の集合を読む。集合をスクリプトへ
# 書き写さないのは、どちらかを更新したときに黙ってズレるのを避けるため。
#
# モーションFBXではなく**キャラ側のリグ**を基準にする。モーションは後から
# 差し替わる (実際 walking.fbx が41ボーンの版に入れ替わった) ので、基準に
# すると自分自身を基準にできなくなる。キャラのリグは動かない。
# `*-for-mixamo.fbx` は古い FBX 形式 (7400) で Blender 5.2 では
# アーマチュアを復元できない。ビルド側が実際に使う 7700 のベース FBX を
# 基準にして、変換スクリプトとGLBビルドで同じ33ボーン集合を読む。
REFERENCE_FBX = REPO / 'assets/character/dance-daisuke/export/dance-daisuke.fbx'

FBX_IMPORT_KWARGS = {
    'global_scale': 1.0,
    'use_anim': True,
    'automatic_bone_orientation': False,
}


def sole_armature() -> bpy.types.Object:
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'expected 1 armature, got {len(armatures)}')
    return armatures[0]


def load_bones(path: Path) -> set[str]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path), **FBX_IMPORT_KWARGS)
    return {bone.name for bone in sole_armature().data.bones}


def align(path: Path, reference: set[str]) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path), **FBX_IMPORT_KWARGS)
    armature = sole_armature()

    current = {bone.name for bone in armature.data.bones}
    extra = current - reference
    missing = reference - current

    if missing:
        raise RuntimeError(f'{path.name}: 基準にあるボーンが足りない: {sorted(missing)}')
    if not extra:
        print(f'{path.name}: すでに基準と一致 ({len(current)} bones)。そのまま。')
        return

    # 削るのは末端の枝だけ。基準のボーンの親になっているものを削ると、
    # 残す側の親子関係が壊れる。
    blockers = [
        bone.name
        for bone in armature.data.bones
        if bone.name in reference and bone.parent is not None and bone.parent.name in extra
    ]
    if blockers:
        raise RuntimeError(f'{path.name}: 余分なボーンを親に持つ基準ボーンがある: {blockers}')

    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = armature.data.edit_bones
    for name in extra:
        bone = edit_bones.get(name)
        if bone is not None:
            edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode='OBJECT')

    # 書き出す範囲はシーンのフレーム範囲で決まる。既定のまま出すと、
    # それより長いモーションが途中で切れる (419フレームが251で切れた)。
    # アクションの長さに合わせてから出す。
    action = bpy.data.actions[0] if bpy.data.actions else None
    if action is not None:
        start, end = action.frame_range
        bpy.context.scene.frame_start = int(start)
        bpy.context.scene.frame_end = int(end)

    after = {bone.name for bone in armature.data.bones}
    if after != reference:
        raise RuntimeError(f'{path.name}: 揃わなかった (残り {len(after)} bones)')

    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=False,
        object_types={'ARMATURE'},
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
    )
    frames = '' if action is None else f' frames={action.frame_range[0]:.0f}..{action.frame_range[1]:.0f}'
    print(f'{path.name}: {len(current)} -> {len(after)} bones (削除 {len(extra)}本){frames}')


def main() -> None:
    args = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if not args:
        raise SystemExit(
            'usage: blender --background --python scripts/align-motion-rig.py -- <fbx> ...'
        )

    reference = load_bones(REFERENCE_FBX)
    print(f'基準リグ: {REFERENCE_FBX.name} ({len(reference)} bones)')

    for arg in args:
        align(Path(arg).resolve(), reference)


main()
