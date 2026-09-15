# Star Platimun low-poly

## FBX成果物

受け渡し用FBXは [`export/star-platimun-low-poly.fbx`](export/star-platimun-low-poly.fbx) に置いている。元のFBXファイル名は `coiso.fbx`。対応するテクスチャは [`textures/`](textures/) にまとめている。

## ゲーム用GLB

`public/models/star-platinum.glb` はリグ付けの後に生成する（下記参照）。

どちらのビルドスクリプトも、Maya由来の空Object（`group*` / `pSphere1` など84個、
うち数個はスケールが0に近く、そのまま書き出すとthree.js側で逆行列の求まらない
変換になる）を落とし、`textures/` の baseColor だけを1024pxへ縮めて貼り直す。
normal・occlusion・metallic・roughness は含めない。normal 3枚だけで12.4MiBあり、
他のキャラGLB（400〜520KiB）と桁が変わるうえ、プレイヤーサイズの表示では効かない。

身長約2.0・足元原点・正面 -Y（Blender空間）で、
[`../../AGENTS.md`](../../AGENTS.md) の規約どおり。

## リグとモーション（Mixamo Auto-Rigger）

元のFBXはリグもアニメーションも持たないTポーズの静的モデルだった。Mixamo の
Auto-Rigger でリグを付け、待機モーション込みで書き出してある。

### アップロード用FBXを作る

```bash
blender --background --python scripts/prepare-star-platinum-for-mixamo.py
```

`export/star-platimun-for-mixamo.fbx` ができる。Auto-Rigger は1メッシュしか
受け付けないため、`cuerpo1` / `pelo` / `ropa` を結合したもの。元のTポーズは
Auto-Rigger が想定する姿勢そのものなので触っていない。

境界エッジが約7,700あるが、鎧・ブーツ・髪のように重なったシェルで作られた
ゲーム用アセットでは普通の状態。Auto-Rigger はシルエットとマーカー位置から
スケルトンを合わせるため、この形のままで通る。

### Mixamo での取得

[mixamo.com](https://www.mixamo.com/) へアップロードして Auto-Rig し、
**Neutral Idle** を選んで **With Skin** でダウンロードし、
`export/Neutral Idle.fbx` として置く。

堀大輔の共有モーション（`assets/motions/`）と違い With Skin にしてある。
このキャラのリグは Standard Skeleton (65ボーン) で、共有モーションが前提と
する `mixamorig:*` 33ボーンと集合が一致しない。リグとモーションを1本の
FBXへ同梱し、このキャラだけで完結させる方が食い違わない。

そのため `assets/motions/` の共有モーションはこのキャラへは適用できない。

### モーションを足す

追加のモーションは Mixamo から **Without Skin**（In Place・30fps）で落とし、
`export/motions/` へ置く。ボーン名の集合がベースのリグと一致していれば、
メッシュ無しのモーションだけで足りる。共有の `assets/motions/` ではなく
キャラ側へ置くのは、このリグが52ボーンで共有側の33ボーンと集合が違うため。

置いたら `scripts/build-star-platinum-glb.py` の `MOTIONS` へファイル名と
クリップ名を足してGLBを作り直す。ボーン名が食い違う場合はエラーで止まる
（黙って姿勢が壊れたGLBを作らないため）。

現在入っているモーション:

| FBX                 | クリップ名 | 由来         |
| ------------------- | ---------- | ------------ |
| （ベースFBXに同梱） | `idle`     | Neutral Idle |
| `Punch Combo.fbx`   | `punch`    | Punch Combo  |

`punch` はまだゲーム側から再生していない。使うときは
`src/rendering/character/character-models.ts` の `clip` を切り替えるか、
堀大輔の `horiDaisukeMotions.ts` のようなクリップ定義を作る。

### GLBへまとめる

```bash
blender --background --python scripts/build-star-platinum-glb.py
```

Mixamoのルート回転（X軸90°）を適用してから書き出すので、堀大輔のような
正規化1.0の例外にはならない（[`../../AGENTS.md`](../../AGENTS.md)）。
クリップ名は `idle` へ変えてある。`src/rendering/character/character-models.ts`
の `clip` と一致させること。片方だけ変えるとクリップを引けなくなる。
