# モーションの追加と割り当て

モーションの定義は [`assets/motion-manifest.json`](../assets/motion-manifest.json)
1本にまとめてある。Blenderのビルドスクリプトと表示層 (TypeScript) が同じ
ファイルを読むので、片方だけ更新してGLBとReact側がズレることがない。

以前は定義が3箇所へ散っていた。ビルドスクリプトの `MOTIONS`、
`horiDaisukeMotions.ts` の `MOTION_CLIPS`、`character-models.ts` の `clip`。
どれか1つを足し忘れるとキャラが一切動かなくなるが、気付く手段が無かった。

## マニフェストの構造

モデルごとに次を持つ。

| 項目             | 意味                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `url`            | `public/` 以下のGLB                                              |
| `standingHeight` | GLB内で立っている状態の高さ。表示スケールの分母                  |
| `rig`            | `mixamo` なら共有モーションFBXを足せる。`custom` は独自ボーン名  |
| `build`          | GLBを生成するスクリプトと、FBX→クリップ名の対応。手製なら `null` |
| `clips`          | GLBに入っているクリップと、ループするか                          |
| `defaultClip`    | どの条件にも当たらないときのクリップ                             |
| `rules`          | 「この状態ならこのクリップ」の並び                               |

`clips` と `build` は両方向で突き合わせる。Python側 (`scripts/motion_manifest.py`)
がビルドで作るクリップと `clips` の一致を確かめ、TypeScript側
(`motion-manifest.test.ts`) が `clips` と実際のGLBの中身の一致を確かめる。
**まだ生成できないクリップを `clips` へ書くと両方が落ちる。**

## 状態からクリップを決める仕組み

`rules` を上から見て、**最初に当てはまった行**のクリップを再生する。どれにも
当たらなければ `defaultClip` へ落ちる。

状態の総当たり表にはしない。ボスだけで `BossPhase`(6) × `AttackPhase`(4) あり、
意味のあるマスはごく一部になる。優先順の並びなら、実際に使う行だけを短く
持てる。

使える条件は `MOTION_CONDITIONS`
([`src/rendering/character/motion-manifest.ts`](../src/rendering/character/motion-manifest.ts))
にある。

| 条件            | 立つとき                             |
| --------------- | ------------------------------------ |
| `attacking`     | 連撃の局面が `DONE` 以外             |
| `fallingAsleep` | `PlayerStatus` が `FALLING_ASLEEP`   |
| `asleep`        | `PlayerStatus` が `ASLEEP`           |

判定のタイミングはゲームロジックが持ち、表示層は状態を読むだけにする
（[`technical-design.md`](technical-design.md) §13）。当たり判定を
Animation Frame から呼び返さない方針はここでも変えていない。

## GUIで割り当てる

開発サーバーで `?debug=motion` を開くと、モーション確認と割り当ての画面が出る。
ボス専用だった `?debug=hori` も同じ画面へ繋いである。

できることは2つ。

1. **確認**: モデルとクリップを選んで、視点を回しながら見た目を確かめる
2. **割り当て**: 「どの状態でどのクリップを再生するか」を組み立てる

「保存」を押すと `assets/motion-manifest.json` がその場で書き換わる。開発
サーバーが保存を引き受け（[`vite-plugin-motion-manifest.ts`](../vite-plugin-motion-manifest.ts)）、
書いたあとは Vite がマニフェストを読み直すので、画面はそのまま新しい割り当てで
動く。貼り付け直す手間は要らない。あとは差分を確認してコミットする。

送るのはルールだけで、残りの項目 (URL・身長・クリップ・ビルド設定) はサーバー側が
読んだ値をそのまま残す。マニフェストに無いモデル名は黙って捨てる。GUIで触って
いない部分がGUIによって壊れることはない。

この保存の口は **開発サーバーにしか無い**（プラグインが `apply: 'serve'`）。
本番ビルドには入らないので、公開されたゲームからマニフェストは書き換えられない。

## モーションを増やす

Mixamoリグのモデル (`hori-daisuke` / `star-platinum`) の場合。

### GUIから取り込む

1. Mixamo から **Without Skin** でFBXを落とす
   （設定は [`assets/motions/README.md`](../assets/motions/README.md)）
2. `?debug=motion` でモデルを選び、「モーションを追加」へFBXを投げる
3. クリップ名とループ設定を入れて「取り込んでビルド」

置き場所への配置・マニフェストへの登録・Blenderでのビルドまで通す。手順の
どれかを飛ばしてGLBとマニフェストがズレることがない。Blenderを挟むので
数十秒かかる。

**失敗したら全部元へ戻す。** FBXは消し、マニフェストも書き換える前へ戻す。
`clips` に実体の無いクリップが残ると、Python側とTypeScript側の突き合わせが
両方落ちて原因が分かりにくくなるため。

失敗したときは Blender の出力をそのまま画面へ出す。よくあるのは
**With Skin で落としてしまった**場合で、ボーンの集合が合わないことを
Blender が食い違った名前を並べて教えてくれる。

取り込んだあとはページを再読み込みするとクリップが選べる。

### CLIから取り込む

GUIを使わない場合は次の手順。やることは同じ。

1. 共有なら `assets/motions/`、キャラ専用ならキャラ側の `export/motions/` へ置く
   （置き場所はマニフェストの `build.motionDir` が持つ）
2. マニフェストの `build.sources` にファイル名とクリップ名を、`clips` に
   クリップ名とループ設定を足す
3. GLBを生成し直す

   ```bash
   blender --background --python scripts/build-hori-daisuke-glb.py
   ```

4. `pnpm test` でGLBとマニフェストの一致を確かめる
5. `?debug=motion` で見た目を確かめ、必要なら状態へ割り当てる

> `blender --background --python` は、**スクリプトが例外で落ちても終了コード 0 を
> 返す**。成否は出力の Traceback で判断する（GUIの取り込みはそうしている）。

### 独自リグのモデル

`dance-daisuke` と `paypay-daisuke` は Blender製で、`mixamorig:*` のボーンを
持たない (`Head`, `Hand.L` のような独自名)。共有モーションFBXはそのままでは
載らないので、クリップを増やすにはBlenderでのリグ作業が要る。いまは1体につき
1クリップで、どの状態でもそれを再生する。

## 積み残し

- `fallingAsleep` / `asleep` の条件は仕組みとしては通っているが、堀大輔の
  `sleep` 以外に当てるクリップがまだ無い
- ボスの条件 (フェーズ・攻撃の局面) はまだ `MOTION_CONDITIONS` に無い。
  `BossArenaScene` から `context` を渡す配線だけは通してあるので、条件と
  クリップが揃えばそこへ足せる
- 「移動中」の条件はまだ無い。位置は Object3D へ直接入っていてスナップショット
  に出てこないため判定できない。位置差分を毎フレーム取ると、再レンダーを
  抑えている `isSameView` の意味が無くなる。判定が無い条件をGUIの選択肢へ
  出すと、絶対に当たらないルールを組めてしまうので置いていない

## 表示スケールの注意

`hori-daisuke` の `standingHeight` (0.762) は **`stand-up` の最終姿勢での
高さ**を実測した値。`defaultClip` を別のクリップへ変えると見た目の身長が
変わる（[`assets/AGENTS.md`](../assets/AGENTS.md)）。既定を動かすときは
この値も測り直す。
