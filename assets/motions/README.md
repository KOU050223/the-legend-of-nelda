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

置いただけでは使われない。各キャラのビルドスクリプトの `MOTIONS` にファイル名と
クリップ名を登録して、GLBを生成し直す。ファイル名はここと各キャラの `motions/` の
両方から探されるので、どちらに置いたかを書き分ける必要はない。

- 堀大輔: [`scripts/build-hori-daisuke-glb.py`](../../scripts/build-hori-daisuke-glb.py)

## 置いてあるもの

| FBX                 | 由来          | 備考                                  |
| ------------------- | ------------- | ------------------------------------- |
| `walking.fbx`       | Walking       | 堀大輔のGLBで `walk` として使っている |
| `Sleeping Idle.fbx` | Sleeping Idle | 寝落ち状態用。まだGLBへ入れていない   |
