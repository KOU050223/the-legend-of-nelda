# Hori Daisuke v1 — Blender modeling reference

最新: [v3 顔修形・全身ブロックアウト](blender/hori-daisuke-blockout-v3.blend)。脚・パンツ・靴・手指まで追加。[確認画像と残る修形点](blender/BLOCKOUT-V3.md)。v3単体は完成モデル・リグ済みモデルではない。

## FBX成果物

受け渡し用FBXは [`export/hori-daisuke-v1.fbx`](export/hori-daisuke-v1.fbx) に置いている。元のFBXファイル名は `hori-daisuke-session-before-v4.fbx` で、`blender/hori-daisuke-session-before-v4.blend` から書き出したもの。編集工程の`.blend`やスクリプトは `blender/` に残している。

## リグ済みFBX（Mixamo / v4）

ゲームで動かす用のリグ付きFBXは
[`export/hori-daisuke-rigged-zombie-stand-up.fbx`](export/hori-daisuke-rigged-zombie-stand-up.fbx)。
v4モデルにMixamoの33ボーンリグ（`mixamorig:*`）を付け、
Zombie Stand Up（1〜94フレーム）を1本持たせたもの。テクスチャ画像は無く、
マテリアルは単色。Blender書き出し用のライト・カメラも同梱される。

## モーションFBX（Mixamo / Without Skin）

追加のモーションは Mixamo から **Without Skin**（FBX Binary / 30fps / Keyframe
Reduction none）で落として [`export/motions/`](export/motions/) に置く。With Skin
だとモーション1本ごとにメッシュとテクスチャが丸ごと付いてくるため、リポジトリに
同じモデルが何度も入る。Without Skin ならボーンのキーフレームだけで済む。

ロコモーション系（歩き・走り）は **In Place 版**を落とす。ルートモーションが
入っていると、位置制御をゲームロジック側でやるときに干渉する。

Mixamo のアクション名はどれも `mixamo.com` なので、GLBへまとめる際に
ビルドスクリプト側の `MOTIONS` がクリップ名を付け直す。

| FBX               | GLB内のクリップ名 | 再生      | 由来                        |
| ----------------- | ----------------- | --------- | --------------------------- |
| （ベースFBX同梱） | `stand-up`        | 1回・停止 | Zombie Stand Up（登場演出） |
| `walking.fbx`     | `walk`            | ループ    | Walking                     |

## Web表示用GLBの生成

ベースFBXとモーションFBX群を1つのGLBへまとめ、`public/models/hori-daisuke.glb`
に置く。ライト・カメラは変換時に落とし、リグ・メッシュ・アニメーションだけを残す。

```sh
blender --background --python scripts/build-hori-daisuke-glb.py
```

モーションを増やすときは3箇所を必ず揃える。片方だけだとクリップ名がズレる。

1. `export/motions/` にFBXを置く
2. [`scripts/build-hori-daisuke-glb.py`](../../../scripts/build-hori-daisuke-glb.py) の `MOTIONS`
3. [`src/rendering/character/horiDaisukeMotions.ts`](../../../src/rendering/character/horiDaisukeMotions.ts) の `HoriDaisukeMotion` と `MOTION_CLIPS`

生成後は `?debug=hori` の確認画面で各モーションを再生して確かめる。

## 一次ブロックアウト（2026-09-14）

[hori-daisuke-blockout-v2.blend](blender/hori-daisuke-blockout-v2.blend) に顔・髪・首・肩・上半身・上腕・前腕・黒Tシャツの編集用ブロックアウトを作成した。元の参照工程は保持。髪なし顔グレー用の別シーンを含む。完成モデルではなく修形確認段階。

[操作方法・確認画像・検証範囲・残る修形点](blender/BLOCKOUT-V2.md)。以下の仮寸法は参照準備時の値で、v2では写真と成人比率を優先して頭幅などを調整している。

## 目的

提示された2枚の写真から、Blender MCPで人物モデルを作るための下準備。現段階は「生成参考＋観察メモ＋参照配置」の段階で、本人の実測スキャンや完成モデルではない。

## 参考の優先順位

1. `source/source-front.png` — 顔、髪、正面の表情、黒Tシャツの実写主基準
2. `source/source-gym.png` — 肩・上腕・胴体の筋肉量、袖なし衣装時の腕、背面の補助基準
3. `turntable/*.png` — ImageGenで補完した8方向＋真上。左右・背面・頭頂の見えない範囲はデザイン補完

## 観察できる識別特徴

- 成人男性。短い黒髪、軽い無造作感、前髪は不均一な束で額にかかる
- 顔は縦長寄りの卵形〜やや長方形。眉は比較的太く、目は暗色で横長
- 鼻筋は直線的で、鼻先は尖りすぎない。口角が上がった自然な笑顔
- 首は太め。肩幅が広く、三角筋・上腕・前腕が発達したアスリート体型
- 上半身に対して腰はやや絞られる。脚は写真で完全には見えないため、全身比率は仮設定
- 主衣装は黒のフィットした半袖スポーツTシャツ。袖口・襟・縫い目はモデル上で分離可能

## 3D初期基準（仮値）

用途未指定のため、まずはゲーム用の編集可能な全身モデルを想定する。実寸ではなく、Blender内の相対比率を固定するための初期値。

| 項目       |     初期値 | 備考                          |
| ---------- | ---------: | ----------------------------- |
| 身長       |  1.00 unit | 実身長ではなく正規化スケール  |
| 頭頂〜顎   | 0.135 unit | 約7.4頭身の仮置き             |
| 肩幅       | 0.285 unit | 写真から見える広い肩幅を優先  |
| 頭幅       | 0.155 unit | 髪を除く頭蓋の仮値            |
| 首幅       | 0.095 unit | 太め、Tシャツ襟へ自然につなぐ |
| 胸郭最大幅 | 0.275 unit | 胸〜肩の最大幅                |
| 腰幅       | 0.205 unit | 肩から腰にかけて緩やかに絞る  |
| 上腕長     | 0.170 unit | 肩峰〜肘                      |
| 前腕長     | 0.145 unit | 肘〜手首                      |
| 足長       | 0.145 unit | 靴込みの仮値                  |

## Blender座標・参照配置

- Z-up、人物の正面を -Y、人物の左を +X とする
- 単位は `METRIC`。`character_height = 1.0` の正規化スケール
- 水平8視点は同一高さ・同一正投影スケールの参照板に配置
- 正面: カメラ方向 -Y、左側: +X、背面: +Y、右側: -X
- 真上: +Zから見下ろし、人物の正面が画面下方向になるようにする
- 参照板は `REF_` コレクション、画像は `REF_IMG_` オブジェクト名で管理

## モデリング順序

1. 頭蓋・顔の低密度グレーモデル（髪を非表示）
2. 正面／側面／左前45°で眉、眼窩、鼻、口、顎の粗形を確認
3. 首・肩・胸郭・上腕のボリューム
4. Tシャツを別オブジェクトとして作成
5. 前髪、側頭部、後頭部、頭頂の主束を少数から追加
6. 必要に応じて手・靴・リグ・表情を拡張

## 注意点

- 生成参考は原写真と幾何学的に一致する保証がない。顔と正面の印象は原写真を優先する
- 写真は透視撮影で、真正面・真横の測定画像ではない。数値は比率の初期案
- 画像に写っていない耳の形、後頭部、肩甲骨、手足の細部は推定
- 現段階ではUV、リグ、アニメーション、完全な穿插なしは未検証
