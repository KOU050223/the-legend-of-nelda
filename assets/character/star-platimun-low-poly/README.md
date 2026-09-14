# Star Platimun low-poly

## FBX成果物

受け渡し用FBXは [`export/star-platimun-low-poly.fbx`](export/star-platimun-low-poly.fbx) に置いている。元のFBXファイル名は `coiso.fbx`。対応するテクスチャは [`textures/`](textures/) にまとめている。

## ゲーム用GLB

`public/models/star-platinum.glb` は次で生成する。

```bash
blender --background --python scripts/convert-star-platinum-to-glb.py
```

FBXはMaya由来で、変換に不要なものを多く含む。スクリプトは空Object（`pasted__*`
など84個、うち数個はスケール0でthree.js側の変換が壊れる）を落とし、`textures/` の
baseColorだけを1024pxへ縮めてマテリアルへ貼り直す。normal・occlusion・metallic・
roughness は含めない。normal 3枚だけで12.4MiBあり、他のキャラGLB（400〜520KiB）と
桁が変わるうえ、プレイヤーサイズの表示では効かない。

身長2.0・足元原点・正面 -Y（Blender空間）で、[`../../AGENTS.md`](../../AGENTS.md)
の規約どおり。リグもアニメーションも持たない静的なTポーズのため、`motions/` の
Mixamoモーション（`mixamorig:*` 33ボーン前提）はそのままでは適用できない。
