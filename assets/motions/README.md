# 共有モーションFBX（Mixamo / Without Skin）

全キャラで使い回すモーションのFBXを置く。Mixamo のリグは `mixamorig:*` で共通
なので、歩く・走るのような汎用モーションはキャラに紐づかない。ここに置いた1本を
どのキャラのGLBからも参照する。

ボス専用の攻撃モーションのように流用の余地がないものは、ここではなくキャラ側の
`assets/character/<キャラ>/export/motions/` に置く。

## ダウンロード設定

Mixamo の DOWNLOAD SETTINGS を次にする。

| 項目               | 値               |
| ------------------ | ---------------- |
| Format             | FBX Binary(.fbx) |
| Skin               | **Without Skin** |
| Frames per Second  | 30               |
| Keyframe Reduction | none             |

**Without Skin** が要点。With Skin だとモーション1本ごとにメッシュとテクスチャが
丸ごと付いてきて、同じモデルがリポジトリに何度も入る。Without Skin ならボーンの
キーフレームだけなので、1本あたり数百KBで済む。

ロコモーション系（歩き・走り）は **In Place 版**を選ぶ。ルートモーションが入って
いると、位置制御をゲームロジック側でやるときに干渉する。

## 使い方

置いただけでは使われない。[`assets/motion-manifest.json`](../motion-manifest.json)
の `build.sources` にファイル名とクリップ名を、`clips` にループ設定を登録して、
GLBを生成し直す。ファイル名はここと各キャラの `motions/` の両方から探されるので、
どちらに置いたかを書き分ける必要はない。

マニフェストはビルドスクリプトと表示層の両方が読む。以前のように
スクリプト側とReact側へ別々に書く必要はない。手順は
[`docs/motion-manifest.md`](../../docs/motion-manifest.md) にある。

- 堀大輔: [`scripts/build-hori-daisuke-glb.py`](../../scripts/build-hori-daisuke-glb.py)
- スタープラチナ: [`scripts/build-star-platinum-glb.py`](../../scripts/build-star-platinum-glb.py)

## 置いてあるもの

| FBX                             | 由来                      | 備考                                   |
| ------------------------------- | ------------------------- | -------------------------------------- |
| `walking.fbx`                   | Walking                   | 堀大輔のGLBで `walk` として使っている  |
| `Sleeping Idle.fbx`             | Sleeping Idle             | 堀大輔のGLBで `sleep` として使っている |
| `Idle.fbx`                      | Idle                      | Pay大輔のリグで落としたもの            |
| `Warrior Idle.fbx`              | Warrior Idle              | 堀大輔の骨格。まだGLBへ入れていない    |
| `Standing W_Briefcase Idle.fbx` | Standing W/Briefcase Idle | 堀大輔の骨格。まだGLBへ入れていない    |
| `Sprinting Forward Roll.fbx`    | Sprinting Forward Roll    | 回避用。41ボーンなので要変換           |

## 骨格を揃える

**モーションFBXの骨格は「Mixamoでどのキャラを選んで落としたか」で変わる。**
骨格が大きく違うモーションを当てると、腕が伸びる・姿勢が合わないといった
壊れ方をする。落としてきたら、まず当てる先のキャラと骨格が近いかを見る。

- ボーン数が違う (指の有無など) → [`scripts/align-motion-rig.py`](../../scripts/align-motion-rig.py) で基準リグへ揃える
- 胴の長さ (腰→頭) が2%以内なら位置チャンネルをそのまま使える。
  それより離れていると、ビルドスクリプトが回転だけを移す

各キャラのベースFBXは **With Skin で落としたモーション**を使う。Auto-Rigger の
キャラ出力をそのままベースにすると、レスト姿勢がアップロードした姿勢のまま
残り、モーションと噛み合わない (Issue #98)。

GLBへ入れていないFBXをマニフェストの `clips` へ書くと、Python側とTypeScript側の
両方の突き合わせが落ちる。入れるときは同時にGLBを生成し直す。`?debug=motion`
の「モーションを追加」は、置く・登録する・ビルドするをまとめてやる。
