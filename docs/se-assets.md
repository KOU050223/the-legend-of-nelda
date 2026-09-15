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
| `futon-jingle.wav`       | ふかふか布団の予兆 | 専用ジングル → 低い寝息 → 着弾直前の「ポフッ」(TELEGRAPH全体を通しで再生) |
| `alarm-burst.wav`        | 絶対起床アラームの判定 | 衝撃波が出る瞬間の爆発音。鳴り終わりに `hori-complaint` が続く |
| `hori-complaint.wav`     | 絶対起床アラームの判定 | 「やめてもらっていいですか」。`alarm-burst` から `followedBy` で連結 |
| `hit-impact.wav`         | 被弾               | ヒットSE                  |
| `dodge-success.wav`      | 回避成功           | 短い成功SE                |
| `guard-success.wav`      | ガード成功         | 衝突SE                    |
| `counter-success.wav`    | カウンター成功     | -                         |
| `boss-down.wav`          | 大ダウン発生       | -                         |

ファイル名は Audio Cue ID（`src/game/attacks/` の各技が返す文字列）に
合わせてある。技側で Cue ID を変えたら
[`src/audio/sound-manifest.ts`](../src/audio/sound-manifest.ts) も直す。

## 単騎PoC とボス戦で経路が違う

SEの引き方は2系統ある。**技の置き場所で決まる**ので、足す前にどちらかを見る。

| | 単騎PoC (`src/game/attacks/`) | ボス戦 (`src/game/boss/`) |
| --- | --- | --- |
| 技の例 | 枕薙ぎ払い・あくび衝撃波・ふかふか布団 | 絶対起床アラーム ほか |
| イベント | `ATTACK_AUDIO_CUE` | `BOSS_ATTACK_STARTED` / `BOSS_ATTACK_ACTIVE` |
| 引き方 | Cue ID の文字列から `soundIdForAudioCue` | `HoriAttackId` で直接分岐 |

ボス側に Cue ID の仕組みは無いので、文字列の表を挟まず技IDで引く。

### 予兆と判定

`BOSS_ATTACK_STARTED` は**予兆の頭**で流れる。技が実際に出る瞬間に鳴らしたい音は
これでは早すぎるので、判定 (ACTIVE) へ入った時点で `BOSS_ATTACK_ACTIVE` が
流れる。絶対起床アラームの爆発音はこちらに乗っている。

処理落ちで判定の尺をまるごと飛ばしても1回だけ流れる。当たり判定と同じ
`resolvedDuringActive` を基準にしているため、「音は鳴ったが当たらない」
「当たったが無音」がずれて起きることがない。

### 続けて鳴らす

続けたい音は `followedBy` で繋ぐ。尺を定数で持って `setTimeout` で繋ぐと
素材を録り直すたびにコードの数値がずれるので、実ファイルの `ended` から繋ぐ。
長さの出どころは素材1つで済む。

### ボス戦の音は全部は鳴らない

ボス戦のアリーナは `BossArenaScene` が AudioManager を繋いでいるが、ボスが
流すイベントは PoC 側 (`JUDGED` / `COMBAT_STATE_CHANGED`) とは別物なので、
被弾音や回避成功音はまだ鳴らない。鳴るのは上の表に載っているものだけ。

## 仮素材を作り直す

```bash
node scripts/generate-placeholder-se.mjs
```

本素材へ全部入れ替えたら、生成スクリプトとこの節は消してよい。
