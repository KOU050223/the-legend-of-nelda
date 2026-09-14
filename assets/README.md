# Character assets

キャラクターアセットは、用途ごとに次のディレクトリへ分けて管理する。

- `*/export/`: 参照・受け渡し用のFBX成果物
- `*/blender/`: Blenderの編集工程、スクリプト、作業用`.blend`
- `*/source/`: 元写真などの一次参照素材
- `*/turntable/`: 多視点の確認用参照画像
- `*/textures/`: FBXに対応するテクスチャ

FBXを探す場合は、各キャラクターの`export/`を参照する。`blender/`に残る`.blend`やスクリプトは編集履歴・中間工程であり、受け渡し用FBXとは区別する。
