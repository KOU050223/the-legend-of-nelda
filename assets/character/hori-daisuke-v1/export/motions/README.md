# 堀大輔専用のモーションFBX

このキャラだけで使うモーションのFBXを置く。ボス専用の攻撃のように、他のキャラへ
流用する余地がないものが対象。

歩く・走るのような汎用モーションは、Mixamo のリグが共通で流用できるため、ここでは
なく [`assets/motions/`](../../../../motions/) に置く。

ダウンロード設定（**Without Skin** / FBX Binary / 30fps / Keyframe Reduction none）と
登録のしかたは [共有モーションのREADME](../../../../motions/README.md) と同じ。
ファイル名は共有側とここの両方から探されるので、
[`scripts/build-hori-daisuke-glb.py`](../../../../../scripts/build-hori-daisuke-glb.py)
の `MOTIONS` にファイル名とクリップ名を書けばよい。

今は空。共有側で足りているうちはここへ置かない。
