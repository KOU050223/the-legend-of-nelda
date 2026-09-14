# v3 顔修形・全身ブロックアウト

2026-09-14。[工程](hori-daisuke-blockout-v3.blend)。完成モデルではなく、全身比率と修形を確認する段階。

現在の未保存セッションを `hori-daisuke-session-before-v3.blend` にコピー保存してから制作。元参照・v2はハッシュ一致で変更なし。旧口・髪・下半身の部品は `V3_Previous_Parts` に非表示で保持。

今回の変更:

- 首の上端を頭蓋内へ延長・縮小。接合の見た目にはまだ境界が残る。
- 唇と浅い口内表示面、上歯の帯を追加。静的な笑顔の粗形で、口腔や表情変形には未対応。
- 頭皮に沿う黒髪82束に変更し、前髪から側頭部の長さを連続させた。髪の厚みは未適用モディファイア。写真の無造作感に比べ、まだ流れが整いすぎている。
- 骨盤、パンツ、脚、スニーカー、手のひらと左右各5本の指を追加。脚・手足は生成参考に基づく設計補完。
- パンツは編集可能なRemeshとSmoothで外形を接続。腰・膝に断面の段差が残り、ゲーム用の変形トポロジーではない。

`HORI_V3_FULLBODY` が全身表示、`HORI_V3_FACE_GRAY` が髪なし顔グレー。共通モデルコレクション名 `MODEL_HORI_V2` は既存構成を保持。全身カメラは `CAM_Full_*`、顔カメラは `CAM_Face_*`。Z-up、正面-Y、左+X、メートル、倍率1。身長基準1.0、靴底Z=0。

保存後に再読み込みし、次の全身5視点と顔を目視確認した。画像はローカル確認用でGit除外。

- 全身: [正面](previews-v3/v3-full-Front.png)、[左](previews-v3/v3-full-Left.png)、[右](previews-v3/v3-full-Right.png)、[背面](previews-v3/v3-full-Back.png)、[斜視](previews-v3/v3-full-LeftFront45.png)
- 顔: [髪付き正面](previews-v3/v3-head-Front.png)、[髪付き斜視](previews-v3/v3-head-LeftFront45.png)
- グレー: [正面](previews-v3/v3-gray-Front.png)、[側面](previews-v3/v3-gray-Left.png)、[斜視](previews-v3/v3-gray-LeftFront45.png)

参照9枚の保持・パック、既存参照5枚の変換一致、単位、髪なしシーンの髪除外、モデル頂点の有限値を確認。UV、リグ、アニメーション、完全な非貫通、エンジン書き出しは未検証。顔の似せ込み、首・肩・手首・腰の接合、手の自然な曲がり、パンツの断面、髪の乱れを引き続き修形する必要がある。

制作スクリプト `refine_blockout_v3.py` はv2セッションから `refine()` → `fix_hair_edge()` → 顔確認 → `fullbody()` → `unify_pants()` → `save()` の順。読み込みのみでは実行しない。v2ヘルパーを利用する。既存v3保存先への上書きは防止している。

v3 SHA-256: `fd0d80509871d2d0b3b0ffa055f318d1179eb746f4ff9580c686b086129ea3fc`
