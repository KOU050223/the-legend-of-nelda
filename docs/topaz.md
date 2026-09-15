# The Legend of Nelda

> 睡魔と戦う、3人協力型ボスアクション。

- リポジトリ: https://github.com/KOU050223/the-legend-of-nelda
- 本番URL: https://nelda.uozumi05.workers.dev

`TypeScript` `React` `Three.js` `React Three Fiber` `Zustand` `Vite` `MediaPipe` `Web Audio API` `LiveKit` `WebSocket` `Cloudflare Workers` `Blender`

---

## 推しアイデア

- **「見ざる・聞かざる・言わざる」を、そのままゲームの操作制約にした**
- **キーボードを使えないプレイヤーがいる**。ARマーカーとWebカメラで戦う
- **何を喋っても「わっしょーい」にしか聞こえないプレイヤーがいる**
- ゲーム内で睡魔を倒す → **現実で寝落ちしている人を起こす**、へ接続する

---

## 作った背景

三猿（見ざる・聞かざる・言わざる）を協力ゲームに落とし込みたかった。

よくある協力ゲームは「アタッカー / ヒーラー / タンク」のように **強みで役割を分ける**。
本作は逆で、**弱み（制約）で役割を分ける**。

- 見ざる → 常に踊っているので**視界が揺れて状況を把握できない**
- 言わざる → 何を言っても**「わっしょーい」としか伝わらない**
- せざる → **キーボードもマウスもコントローラーも触れない**

制約を押し付けるだけだと理不尽なので、それぞれに制約と表裏一体の強みを持たせた。

```text
Pay大輔（言わざる）
「何をすべきか」を知っている ── でも言葉で説明できない
        ↓
オドルノDaisuke（見ざる）
「そこへ行って何とかする」 ── でも自分では状況が見えない
        ↓
オラ大輔（せざる）
「普通ではできない方法で実行する」 ── でも普通の操作ができない
```

> **答えを一番よく知っている人が、それを一番説明できない。**

この構造が、そのまま「3人でやる必然性」になっている。

狙っているトーンは一貫して **「本人たちは大真面目なのに、外から見るとめちゃくちゃ面白い」**。

---

## 推し技術

1. **ARマーカー + MediaPipe によるキーボードレス操作**（オラ大輔）
2. **音声を「わっしょーい」へ変換して中継する**（Pay大輔 / LiveKit）
3. **オカリナの音程認識をゲームコマンドにする**（Web Audio API + ピッチ検出）
4. **Game Logic を Pure TypeScript に隔離し、lint で機械的に強制する**

---

## プロジェクト詳細

### ゲーム概要

3人のプレイヤーがボス「堀大輔（睡魔）」の1つのアリーナで戦う、**1マップ完結型の3Dボスアクション**。

- 3人同時プレイ / 自由移動あり
- 敵はボスのみ（雑魚敵なし）
- 1戦あたり 5〜8分
- HPが0になると死亡ではなく **「布団に入って寝ようとする」**。他プレイヤーが駆けつけて「寝るな！」入力を連打すると蘇生する

敗北条件は HP ではなく **`SLEEPINESS`（眠気）が100%になること**。

| ボスの攻撃 | SLEEPINESS |
| --- | ---: |
| 枕薙ぎ払い | +10〜15 |
| あくび衝撃波 | +15〜20 |
| ふかふか布団 | +25〜30 |

勝利条件はボスのHPを0にすること。ただし最終フェーズでは、**最終ふかふか布団をカウンターする**ことでFINISHできる。

---

### 開発の進め方：まず1人用で作った

最終形はいきなり3人分割だが、**最初から情報と操作を3人へ割ると、ゲームシステム自体が成立しているか検証できない**。

そこで Phase 1 では、あえて

> **1人で操作して普通に成立するボス戦**

を先に作り切った。固定カメラ・左回避 / 右回避 / ガード / 攻撃の4操作のみ。

その上で Phase 2 で、この1人が使っていた **視覚情報・聴覚情報・判断・操作** を3人へ分解した。
「面白いボス戦」であることを先に確定させてから制約を乗せる、という順序にした。

---

### 1. オラ大輔：ARマーカーで操作する

「せざる」の力により、Keyboard / Mouse / Controller を**一切使えない**。

両手にARマーカーを1枚ずつ装着し、Webカメラで追跡してゲーム操作へ変換する。

```text
左手：LEFT MARKER
右手：RIGHT MARKER
```

マーカーの座標・距離・サイズ・移動速度を取得してジェスチャーへ変換する。フルモーションキャプチャは行わない。

使用ライブラリ:

- `@ar-js-org/aruco-rs` — ArUcoマーカー検出
- `@mediapipe/tasks-vision` — HandLandmarker による手の検出（マーカーのフォールバック）

**設計上のポイント**は、認識結果をゲームロジックへ直接結合していないこと。

```text
Webcam → MarkerDetector → MarkerObservation → GestureRecognizer → GameAction
```

`MarkerDetector` は「カメラ画像をアプリ固有でない観測値へ変換する境界」として定義してある。
そのため、ArUco を MediaPipe に差し替えても、**ゲームロジック側は1行も変わらない**。

```ts
/** カメラ画像をアプリ固有でない MarkerObservation へ変換する境界。 */
export interface MarkerDetector {
  detect(frame: ImageData, capturedAt: number): MarkerObservation;
}
```

---

### 2. Pay大輔：「わっしょーい」変換ボイスチャット

「言わざる」の力により、**本人が何を喋っても他プレイヤーには「わっしょーい」としか聞こえない**。

```text
Pay本人：
「右の祭壇！右！右！」

他プレイヤー：
「わっしょーい！わっしょーい！！」
```

LiveKit（WebRTC）でボイスチャットを実装した上で、Pay大輔だけ**生音声をそもそも送信しない**。

代わりに、ブラウザ内で声を解析して

- `intensity`（声量）
- `durationMs`（長さ）

だけを抽出し、reliable data topic `nelda.wasshoi.v1` へ送る。受信側がその強さと長さに応じて「わっしょーい」を合成再生する。

```jsonc
{ "type": "...", "intensity": 0.8, "durationMs": 620 }
```

**生音声・PCM・文字起こし・録音URLは一切送らない。** 実装は以下で構成した。

| モジュール | 役割 |
| --- | --- |
| `voice-activity-detector.ts` | 発話区間の検出 |
| `adaptive-noise-gate.ts` | 環境ノイズに追従する可変ゲート |
| `system-wasshoi-engine.ts` | 声量・長さ →「わっしょーい」生成 |

権限もサーバー側で固定した。トークン発行時に Pay へは `canPublishSources: [DATA]` のみ、Odoruno / Ora へ `[MICROPHONE, DATA]` を付与する。
**クライアントから渡された role を信用しない**設計にしてあるので、Pay大輔が細工して生声を流すことはできない。

> 情報量は最も多いのに、伝達能力は最も低い。
> だから Ping・マーカー・ジェスチャー・声量の強弱を駆使することになる。

---

### 3. オカリナ：音程をコマンドにする

マイクから吹いたオカリナの音程を判定し、**ド・ミ・ソ**をゲームコマンドへ対応付けている。

```text
マイク → pitchy（ピッチ検出） → NoteClassifier → NoteStabilizer → OcarinaCommand
```

`pitchy` で基本周波数を取り、12音階へ分類し、ゆらぎを安定化させてからコマンドにする。

ここで意識したのは **「対象外の音を丸めない」** こと。

```ts
/**
 * 音声基盤は12音階すべてを返す。ここは「ゲームが使う音だけ拾う」層で、
 * 対象外の音を C / E / G へ丸めない。D を無理に DO や MI にすると、
 * 吹き間違いが正解入力として通ってしまう。
 */
export type OcarinaCommand = 'DO' | 'MI' | 'SO';
export const IGNORE = 'IGNORE' as const;
```

「近い音を拾ってあげる」親切心は、**吹き間違いを正解として通してしまう**ので、明確に `IGNORE` を返す設計にした。

---

### 4. 最重要設計：Game Logic を Pure TypeScript へ隔離する

本作で一番こだわったところ。

```text
Player Input
     ↓
 Game Logic （Pure TypeScript）
     ↓
 Game State / Events
     ↓
┌───────────────┐
│ Rendering     │
│ Audio         │
│ HUD / UI      │
└───────────────┘
```

React Component / R3F Component が戦闘ルールそのものを持たないようにした。判定は純粋関数で書き、結果を Game Event として発行し、描画・音・UIはそれを購読する。

```ts
resolvePlayerAction({ attack, action, inputTime })
// → { result: "PERFECT_DODGE", nextState: "COUNTER_WINDOW" }
```

**これは方針ではなく、lint で機械的に検証している。**

`src/game/**` から `three` / `@react-three/*` / `react` を import すると `pnpm lint` が落ちる（`.oxlintrc.json` の `no-restricted-imports`）。

```text
src/
├─ game/      Game Logic（Three.js・Reactへ依存しない）
├─ input/     DOM/カメラ/マイク → PlayerAction
├─ rendering/ React Three Fiber
├─ audio/     Audio Cue
├─ ui/        HUD / イベントUI
└─ store/     Zustand（表示状態のみ）
```

**この分離のおかげで、Phase 2 で1人用を3人プレイへ分解するとき、戦闘ルール本体をほとんど書き換えずに済んだ。**
入力源がキーボードからARマーカーや音声へ増えても、`GameAction` という共通の契約に変換するだけで済む。

副次的な効果として、**戦闘ロジックがブラウザ非依存になるのでテストが速く書ける**。
`boss-attack.ts`（21KB）に対して `boss-attack.test.ts`（16KB）、`hori-boss.ts`（22.6KB）に対して `hori-boss.test.ts`（30.4KB）と、実装と同等以上のテストを置けている。

---

### 5. モーション定義を1ファイルへ集約する

以前はモーション定義が3箇所へ散っていた。Blenderのビルドスクリプト、表示層の `MOTION_CLIPS`、`character-models.ts` の `clip`。

**どれか1つを足し忘れるとキャラが一切動かなくなるが、気付く手段が無かった。**

そこで `assets/motion-manifest.json` 1本へまとめ、**Blender（Python）側とTypeScript側の両方が同じファイルを読む**ようにした。

- `scripts/motion_manifest.py` が「ビルドで作るクリップ」と `clips` の一致を確認
- `motion-manifest.test.ts` が「`clips`」と「実際のGLBの中身」の一致を確認

両方向から突き合わせるので、**まだ生成できないクリップを書くと両方のテストが落ちる**。

状態からクリップを決める部分は、総当たり表ではなく**優先順ルール**にした。
ボスだけで `BossPhase`(6) × `AttackPhase`(4) あるが、意味のあるマスはごく一部なので、実際に使う行だけを短く持てる。

---

### 6. アリーナの数値を「体感時間」から決める

アリーナは半径24の円。この数字は雰囲気で決めていない。移動速度4 units/秒から逆算した。

| 距離 | 値 | 所要 | 何のための値か |
| --- | ---: | ---: | --- |
| 中心 → 端 | 24 | 6.0秒 | ブルーライト照射から逃げ続けられる長さ |
| 端 → 端 | 48 | 12.0秒 | 散ったあと合流し直せる長さ |
| 装置 → 隣の装置 | 29.4 | 7.4秒 | 結界で「間に合うか」の緊張が出る距離 |
| 最遠地点 → 最寄りの安全地帯 | 17.3 | 4.3秒 | **ボス攻撃の予兆時間の下限**。これより短いと端にいる人が詰む |

座標はすべて `src/game/arena/arena.ts` に Pure TypeScript で持ち、**描画と判定の両方が同じ値を参照する**。
`ARENA_RADIUS` を1箇所直せば、床・岩の壁・木立・装置・安全地帯がすべて追従する。

---

## 使用技術

### フロントエンド

```jsonc
"react": "19.2.8",
"three": "0.186.0",
"@react-three/fiber": "9.7.0",
"@react-three/drei": "10.7.8",
"zustand": "5.0.15",
"typescript": "7.0.2",
"vite": "8.3.0"
```

### 入力・通信

```jsonc
"@ar-js-org/aruco-rs": "0.1.0",   // ARマーカー検出
"@mediapipe/tasks-vision": "1.0.1", // 手の検出
"pitchy": "4.1.0",                 // ピッチ検出（オカリナ）
"livekit-client": "2.17.2",        // ボイスチャット
"ws": "8.18.0"                     // WebSocket（権威サーバー）
```

### なぜ Unity ではなく Web なのか

3Dゲーム単体の演出機能では Unity 等に劣る部分もあるが、本作でやりたいことが**デバイス連携と参加しやすさ**に寄っていたため Web を選んだ。

- 3人が別々の端末から、**URLを開くだけで参加**できる
- Webカメラ / マイクをブラウザ標準APIで扱える
- MediaPipe で顔・手を扱える
- Web Audio API で音声をRoleごとに制御できる
- WebRTC / WebSocket で3人同期できる
- 観客用画面を別クライアントとして出せる

Phase 1 の時点から、この最終形を見越して Web で構築した。

### 通信構成

チートと状態のズレを防ぐため、**サーバー権威型**にした。

```text
Client → JOIN / ACTION → Authority Server (WebSocket)
Client ← WELCOME / STATE / WASSHOI ←
```

`protocol.ts` で受信メッセージを全て型ガードで検証している（`isGameAction` / `isBattleSnapshot` / `isWasshoiEvent`）。
`epoch` と `seq` を持たせて、再接続時に古い入力が適用されないようにしている。

### 3Dアセット

Blender で制作し、GLBへ書き出している。座標系の事故が多発したので、ルールをドキュメント化して固定した。

| 空間 | 上方向 | キャラの正面 |
| --- | --- | --- |
| Blender の編集 | +Z | -Y |
| GLB（書き出し） | +Y | +Z |

- **原点は足元**（Y=0が接地面）。腰や重心に置かない
- **単位はメートル**。等身大の実寸で作る

向きが揃っていないモデルは、**ゲーム側で回さずBlenderで直す**。表示側に個別の補正を積むと、モデルが増えるたびに補正が散らばるため。

### 開発環境・品質管理

| 分類 | 採用 |
| --- | --- |
| Runtime | Node.js 24.19.0 |
| Package Manager | pnpm 11.25.0 |
| Lint / Format | oxlint / oxfmt（Rust製で高速） |
| Test | Vitest + React Testing Library |
| 環境固定 | Nix (`flake.nix`) + direnv |
| Git hooks | lefthook |
| CI | GitHub Actions |
| デプロイ | Cloudflare Workers (Static Assets) |

環境は **Nix で Node.js と pnpm のバージョンごと固定**した。`nix develop` すれば全員が同じ環境になる。

CI は PR と `main` への push で以下を順に実行する。

```text
install → lint → format:check → typecheck → test → build
```

デプロイは Cloudflare Workers Builds（Git連携）が担当し、**PR作成時にブランチプレビューURLが自動発行されてPRコメントへ投稿される**ので、レビュー時に実物を触って確認できる。

---

## AI活用

コーディングAgentとして Claude Code を使用。

`AGENTS.md` / `docs/` に仕様と設計方針を先に書き、**Agentがそれを参照しながら実装する**運用にした。

特に効いたのが、前述の **「Game Logic に three / react を import させない」を lint ルールにした**こと。
方針をドキュメントへ書くだけだと、AIも人間もいずれ破る。**機械的に落ちるようにしておくと、設計が勝手に守られる。**

同様に、モーション定義のマニフェスト突き合わせテストも「壊れたら気付ける」ための仕組みとして入れている。

---

## これからの展望

- オカリナ最終フェーズの役割分担を確定させる
- オラ大輔の専用アクションを詰める
- ショートスリーパー結界（3人の能力を組み合わせないと突破できないギミック）の実装
- プレイテストによるバランス調整（予兆時間・SLEEPINESS上昇量）
- 観客用画面の実装
- **ゲーム内で睡魔を倒したら、現実で寝ている人を起こす**仕組みへの接続
