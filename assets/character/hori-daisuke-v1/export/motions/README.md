# モーションFBX（Mixamo / Without Skin）

Mixamo から **Without Skin** で落としたモーションのみのFBXを置く。設定は
FBX Binary(.fbx) / 30fps / Keyframe Reduction none。

置いただけでは使われない。`scripts/build-hori-daisuke-glb.py` の `MOTIONS` に
ファイル名とクリップ名を登録して、GLBを生成し直す必要がある。詳細は
[キャラクターのREADME](../../README.md)。
