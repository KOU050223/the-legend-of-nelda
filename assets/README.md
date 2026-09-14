# Assets

`character/` にキャラクターごとのアセット、`motions/` に全キャラ共有のモーションを
置く。

## 共有モーション

[`motions/`](motions/) は、どのキャラでも使えるMixamoのモーションFBX（Without
Skin）の置き場所。Mixamo のリグは `mixamorig:*` で共通なので、歩く・走るのような
汎用モーションはキャラに紐づかず、1本を全キャラで使い回す。ボス専用の攻撃のように
流用の余地がないものだけ、キャラ側の `*/export/motions/` に置く。詳細は
[`motions/README.md`](motions/README.md)。

## キャラクターアセット

キャラクターアセットは、用途ごとに次のディレクトリへ分けて管理する。

- `*/export/`: 参照・受け渡し用のFBX成果物
- `*/export/motions/`: そのキャラ専用のモーションFBX（汎用のものは `motions/` へ）
- `*/blender/`: Blenderの編集工程、スクリプト、作業用`.blend`
- `*/source/`: 元写真などの一次参照素材
- `*/turntable/`: 多視点の確認用参照画像
- `*/textures/`: FBXに対応するテクスチャ

FBXを探す場合は、各キャラクターの`export/`を参照する。`blender/`に残る`.blend`やスクリプトは編集履歴・中間工程であり、受け渡し用FBXとは区別する。
