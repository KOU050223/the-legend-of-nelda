# 効果音 (SE) の素材

音源は `public/audio/se/` に置く。現在入っているのは**仮素材**で、
`scripts/generate-placeholder-se.mjs` が合成した WAV。
技と結果を聞き分けられることだけを目的にしており、質は問わない。

## 差し替え方

### 1. 同じ名前で上書きする（コード変更なし）

```bash
cp path/to/本素材.wav public/audio/se/pillow-sweep-wind.wav
```

ファイル名を保ったまま置き換えれば、コードは一切触らなくてよい。

### 2. 別のファイル名・形式で置く

`public/audio/se/` へ置き、[`src/audio/sound-manifest.ts`](../src/audio/sound-manifest.ts)
の `src` を1行書き換える。音量差は同じ表の `gain` で揃える。

```ts
'pillow-swing': { src: '/audio/se/pillow_swing_take3.ogg', gain: 0.45 },
```

## ファイルと役割

音の性格は [`docs/single-player-poc-spec.md`](./single-player-poc-spec.md) §22「音設計」に対応する。

| ファイル                 | 使われる場面       | 仕様上の指定              |
| ------------------------ | ------------------ | ------------------------- |
| `pillow-sweep-wind.wav`  | 枕薙ぎ払いの予兆   | 風切り音 / 直前に音程上昇 |
| `yawn-inhale.wav`        | あくび衝撃波の予兆 | 吸気音 / 直前に無音       |
| `futon-jingle.wav`       | ふかふか布団の予兆 | 専用ジングル              |
| `hit-impact.wav`         | 被弾               | ヒットSE                  |
| `dodge-success.wav`      | 回避成功           | 短い成功SE                |
| `guard-success.wav`      | ガード成功         | 衝突SE                    |
| `counter-success.wav`    | カウンター成功     | -                         |
| `boss-down.wav`          | 大ダウン発生       | -                         |

ファイル名は Audio Cue ID（`src/game/attacks/` の各技が返す文字列）に
合わせてある。技側で Cue ID を変えたら
[`src/audio/sound-manifest.ts`](../src/audio/sound-manifest.ts) も直す。

## 仮素材を作り直す

```bash
node scripts/generate-placeholder-se.mjs
```

本素材へ全部入れ替えたら、生成スクリプトとこの節は消してよい。
