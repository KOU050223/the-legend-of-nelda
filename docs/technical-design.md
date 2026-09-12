# Technical Design

## 0. このドキュメントの目的

本ドキュメントは、The Legend of Nelda の実装における技術方針・アーキテクチャ・責務分離を定義する。

Phase 1 では **1人用の睡魔ボス戦PoC** を実装するが、最終的には以下へ拡張する。

- 見ざる / 聞かざる / 言わざるの3人協力
- 3クライアント間のリアルタイム同期
- 視覚 / 聴覚 / 特殊情報のRole別配信
- カメラ / マイク / DeviceMotion等の入力
- 観客用神視点UI
- 現実世界のデバイスとの連携

そのため、Phase 1の時点から「1人用として最短で動く」だけでなく、**後から3人へ分解しやすい構造**を優先する。

関連ドキュメント:

- [`single-player-poc-spec.md`](./single-player-poc-spec.md)
- [`testing-strategy.md`](./testing-strategy.md)
- [`tests/phase1-single-player-test-spec.md`](./tests/phase1-single-player-test-spec.md)

---

# 1. 採用技術

## 1.1 Phase 1 のメインスタック

```text
Frontend / Game View
├─ React
├─ TypeScript
├─ Three.js
├─ React Three Fiber (R3F)
└─ Drei

Build
└─ Vite

Game Logic
└─ Pure TypeScript

State Management
└─ Zustand を第一候補

Test
├─ Vitest
├─ React Testing Library
└─ Playwright（E2Eが必要になった段階で導入）

CI
└─ GitHub Actions
```

Phase 1では、ネットワーク・MediaPipe・IoT等は実装しない。

---

# 2. Web技術を採用する理由

今回の最終プロダクトでは、単なる1人用3Dゲームではなく以下を扱う可能性が高い。

- 3人が別々の端末から参加する
- URLを開いてすぐ参加できる
- Webカメラを利用する
- マイクを利用する
- MediaPipe等で顔・視線・口の動きを扱う
- Web Audio APIで音声をRoleごとに制御する
- WebSocket / WebRTC等で3人同期する
- スマートフォンのDeviceMotionを利用する
- 観客用画面を別クライアントとして表示する

これらを考慮し、Phase 1からWebベースで構築する。

Unity等のゲームエンジンと比較すると、Web技術は3Dゲーム単体の演出機能では劣る部分もあるが、**最終プロダクト全体のデバイス連携・通信・参加しやすさ**を重視する。

---

# 3. ゲーム表現方針

## 3.1 2.5D固定カメラ型の3Dボス戦

本作は自由探索型3Dゲームにはしない。

基本構成は以下とする。

```text
3D
├─ 睡魔（Boss）
├─ 勇者（Player）
├─ 枕
├─ 布団
├─ 攻撃モーション
├─ パーティクル / VFX
└─ 背景

2D / DOM UI
├─ Boss HP
├─ HORI SLEEPINESS
├─ PERFECT DODGE
├─ JUST GUARD
├─ COUNTER!
└─ その他イベントUI

Camera
└─ 原則固定
```

ゲーム体験は Punch-Out!! のような「正面のボスの予兆を読み、適切な入力で返す」構造を参考にする。

ただし、作品のビジュアル・キャラクター・演出は独自のものとする。

---

## 3.2 フル3D移動を採用しない

Phase 1では以下を実装しない。

- WASD自由移動
- 自由カメラ
- 3Dマップ探索
- ジャンプ
- 物理演算主体の戦闘
- Boss周囲を自由に移動するシステム

プレイヤー位置は概念的には、

```text
LEFT
CENTER
RIGHT
```

程度で十分とする。

左回避 / 右回避はゲーム状態とアニメーションとして表現し、自由移動システムにはしない。

---

# 4. 最重要設計方針

## Game Logic と Presentation を分離する

本プロジェクトで最も重要な設計ルールとする。

```text
Player Input
     ↓
 Game Logic
     ↓
 Game State / Events
     ↓
┌───────────────┐
│ Rendering     │
│ Audio         │
│ HUD / UI      │
└───────────────┘
```

React ComponentやR3F Componentが戦闘ルールそのものを持たないようにする。

例えば、以下のようなロジックはPure TypeScript側で判定する。

```ts
resolvePlayerAction({
  attack,
  action,
  inputTime,
})
```

結果として、

```ts
{
  result: "PERFECT_DODGE",
  nextState: "COUNTER_WINDOW"
}
```

のような結果を返すイメージとする。

3D描画はこの結果を受け取り、モーションやVFXを再生する。

---

# 5. レイヤー構成

Phase 1では概ね以下の5レイヤーへ分離する。

## 5.1 Game Logic

責務:

- State Machine
- 攻撃ルール
- 入力受付判定
- HP / SLEEPINESS
- ダメージ計算
- 勝敗判定
- 攻撃シーケンス

原則としてReact / Three.jsへ依存しない。

---

## 5.2 Input

責務:

- キーボード入力
- ボタン入力
- 将来的なスマートフォン入力
- Phase 2以降のセンサー入力

Game Logicへ直接DOMイベントを渡さず、ゲーム用Actionへ変換する。

例:

```text
ArrowLeft
↓
PlayerAction.DODGE_LEFT
```

---

## 5.3 Rendering

React Three Fiber / Three.jsを使用する。

責務:

- Boss表示
- Player表示
- モーション
- Camera
- 3D Object
- Particle / VFX
- Visual Cue

ゲームの正誤判定は行わない。

---

## 5.4 Audio

責務:

- 攻撃予兆SE
- Hit SE
- BGM
- Audio Cue

Game Logicが直接Audio APIを呼び出さない。

Game EventをAudio Layerが購読して再生する。

---

## 5.5 UI

React DOMを基本とする。

責務:

- Boss HP
- HORI SLEEPINESS
- Event Message
- Tutorial UI
- Result UI

3D Scene内へ無理にHUDを配置せず、通常のHTML/CSS UIを重ねる方式を基本とする。

---

# 6. 攻撃モデル

Boss Attackは、攻撃ロジックと情報提示を分離する。

概念モデル:

```text
BossAttack
├─ id
├─ direction
├─ timing
├─ correctAction
├─ counterWindow
├─ damage
├─ sleepinessDamage
├─ visualCue
└─ audioCue
```

重要なのは、

```text
BossAttack発動
→ SEを直接鳴らす
```

という実装を避けること。

代わりに、

```text
BossAttack
↓
Attack Event
├─ Visual Cue Event
├─ Audio Cue Event
└─ Hit Timing Event
```

とし、それぞれ別レイヤーが購読できるようにする。

これによりPhase 2で、

```text
見ざる     → Audio Cue中心
聞かざる   → Visual Cue中心
言わざる   → 特殊情報
```

のように配信先を変更できる。

---

# 7. State Machine

Phase 1の戦闘状態は仕様書に合わせて以下を基本とする。

```text
INTRO
↓
IDLE
↓
TELEGRAPH
↓
ATTACK
↓
JUDGE
├─ HIT
│   ↓
│  IDLE
│
└─ COUNTER_WINDOW
    ↓
   DAMAGE
    ↓
   IDLE
```

終了状態:

```text
BOSS_DEFEATED
PLAYER_LOSE
```

技固有の処理をState Machine本体へ大量に記述せず、Attack Definition / Attack Handler側へ分離する。

---

# 8. ディレクトリ構成案

Phase 1開始時点では以下を基本案とする。

```text
src/
├─ app/
│  ├─ App.tsx
│  └─ providers/
│
├─ game/
│  ├─ combat/
│  │  ├─ state-machine/
│  │  ├─ damage/
│  │  ├─ input-judge/
│  │  └─ result/
│  │
│  ├─ attacks/
│  │  ├─ pillow-sweep/
│  │  ├─ yawn-wave/
│  │  └─ fluffy-futon/
│  │
│  ├─ sequence/
│  ├─ events/
│  ├─ types/
│  └─ config/
│
├─ input/
│  ├─ keyboard/
│  └─ actions/
│
├─ rendering/
│  ├─ scene/
│  ├─ boss/
│  ├─ player/
│  ├─ effects/
│  └─ camera/
│
├─ audio/
│  ├─ cues/
│  └─ manager/
│
├─ ui/
│  ├─ hud/
│  ├─ event-message/
│  ├─ tutorial/
│  └─ result/
│
├─ store/
│
└─ test/
   ├─ unit/
   ├─ integration/
   └─ helpers/
```

実装が小さい段階で過度にファイル分割しない。

この構成は責務の境界を示すためのものであり、Phase 1の規模に応じて統合してよい。

---

# 9. State管理

React全体で必要な表示状態の共有には Zustand を第一候補とする。

ただし以下を区別する。

## Game Logic State

例:

- Combat State
- Boss HP
- SLEEPINESS
- Current Attack
- Counter Window

ゲームルールの中心。

## Presentation State

例:

- Event Message表示中
- Camera Shake
- UI Animation
- Tutorial Overlay

表示専用。

Presentation StateがGame Logicを書き換えないようにする。

また、単純なローカルUI Stateまで全てZustandへ集約しない。

---

# 10. 時間管理

本ゲームは入力受付時間がゲーム性に直結する。

そのため、時間取得を各Componentで直接行う設計は避ける。

概念的には以下のような抽象化を用意する。

```text
GameClock
├─ RealClock
└─ FakeClock
```

ProductionではRealClock、TestではFakeClockを使用する。

これにより、

- 着弾 -0.60秒
- 着弾 +0.10秒
- Counter開始から0.80秒

などを高速かつ安定してテストできるようにする。

---

# 11. Random管理

攻撃方向・攻撃選択等のRandom処理も直接 `Math.random()` へ依存しすぎない。

概念:

```text
RandomProvider
├─ ProductionRandom
└─ FixedRandom
```

テストでは結果を固定できるようにする。

---

# 12. 3D Asset方針

Phase 1ではグラフィック完成度より、ゲームループ検証を優先する。

初期段階では以下を許容する。

- Primitive Mesh
- 仮モデル
- 仮アニメーション
- フリー / 自作の簡易Asset

ゲームループが成立した後に、

- GLTF / GLB Character
- Boss Animation
- Pillow / Futon Asset
- VFX
- Lighting

を強化する。

3D Assetの完成待ちでロジック実装を止めない。

---

# 13. アニメーション方針

攻撃のアニメーションは見た目だけでなくVisual Cueとしてゲームルールに関係する。

ただし、

```text
Animation Frameそのもの
=
Hit判定
```

にはしない。

Game Logicが持つHit Timingを正とし、Animationをそのタイミングへ合わせる。

これにより、アニメーション差し替えで戦闘判定が壊れることを防ぐ。

---

# 14. UI方針

HUDはReact DOMを基本とし、Canvasとは分離する。

主なUI:

```text
Top
└─ SLEEP DEMON HP

Bottom Left
└─ HORI SLEEPINESS

Center / Event
├─ PERFECT DODGE
├─ JUST GUARD
├─ COUNTER!
├─ DROWSY!
└─ GOOD NIGHT
```

本戦では正解入力を常時表示しない。

Visual Cue / Audio Cue自体がゲームUIの一部として機能する。

---

# 15. Audio方針

Phase 1では通常のブラウザAudioで構わない。

ただしPhase 2でRole別Audioを扱う可能性があるため、Audio再生箇所を分散させない。

```text
Game Event
↓
Audio Manager
↓
Audio Output
```

という経路を基本とする。

将来的にはWeb Audio API等へ置き換え可能な構造にする。

---

# 16. テスト構成

全体方針は [`testing-strategy.md`](./testing-strategy.md) を参照する。

Phase 1の具体ケースは [`tests/phase1-single-player-test-spec.md`](./tests/phase1-single-player-test-spec.md) を参照する。

## Unit Test

Vitestを利用する。

主な対象:

- State Machine
- Input Judge
- Damage
- HP / SLEEPINESS
- Attack Rule
- Timing Boundary
- Win / Lose

Three.jsやReactを起動しなくてもテスト可能な構造を優先する。

## Component Test

必要に応じてReact Testing Libraryを使用する。

対象:

- HUD値更新
- Result UI
- Tutorial表示

## E2E

Phase 1で必要性が出た場合にPlaywrightを導入する。

最初からE2Eテストを大量に作らない。

---

# 17. CI

GitHub Actionsを利用する。

最低限以下をPull Request時に実行する。

```text
Install
↓
Lint
↓
Type Check
↓
Unit Test
↓
Build
```

Integration Testが追加された段階でCIへ組み込む。

必須テストが失敗しているPRは原則マージしない。

---

# 18. Code Quality

Phase 1では以下を導入する。

- TypeScript strict mode
- oxlint
- oxfmt
- Vitest

可能な範囲で型安全性を維持する。

`any` の多用は避ける。

Game Logicで扱う主要概念は型として定義する。

例:

```ts
type PlayerAction =
  | "DODGE_LEFT"
  | "DODGE_RIGHT"
  | "GUARD"
  | "ATTACK";
```

---

# 19. Phase 1で実装しないもの

以下はPhase 1の技術スコープ外とする。

- WebSocketによる3人同期
- WebRTC
- MediaPipe
- 視線推定
- 発話検知
- マイク音声ルーティング
- DeviceMotion
- 観客用神視点Client
- IoT / ESP32
- 現実世界の覚醒装置
- Account / Login
- DB

必要になる前に導入しない。

---

# 20. Phase 2への拡張イメージ

Phase 1:

```text
Keyboard
   ↓
Game Logic
   ↓
Game State
   ↓
Rendering / Audio / UI
```

Phase 2:

```text
🙈 Client     🙉 Client     🙊 Client
     \            |            /
      \           |           /
       Realtime Game Session
               ↓
          Game Logic
               ↓
          Shared State
               ↓
      Role-based Cue Router
        /         |         \
   Visual      Audio      Special
```

Phase 1でGame LogicとPresentationを分離しておくことで、Phase 2ではClient / Role / Cue Routerを追加しても戦闘ルール本体を大きく書き換えないことを目標とする。

---

# 21. Phase 2以降の技術候補

以下は現時点では**候補であり未確定**とする。

## Realtime

候補:

- WebSocket
- Cloudflare Durable Objects
- PartyKit
- Convex

3人ゲームの同期方式が固まった段階で決定する。

## Vision / Face

候補:

- MediaPipe

用途候補:

- 顔向き
- 口の動き
- 発話補助判定
- 視線の粗い推定

## Audio

候補:

- Web Audio API
- WebRTC

## Device Sensor

候補:

- DeviceMotion API
- DeviceOrientation API

## Real World Output

候補:

- Smartphone vibration / sound
- Web Bluetooth
- ESP32
- HTTP / WebSocket経由のIoT制御

---

# 22. 技術選定で優先する基準

新しいLibrary / Serviceを追加する際は以下の順で判断する。

1. ハッカソン期間内に安定して動かせるか
2. デモ環境で再現性があるか
3. テスト可能な構造を維持できるか
4. Phase 2以降へ拡張しやすいか
5. チームメンバーが理解・修正できるか
6. 技術的に面白いか

「技術的に面白い」は重要だが、ゲームの根幹が不安定になる選択は避ける。

本作では、**技術の無駄遣いは体験部分で行い、基盤はできるだけ堅実にする。**

---

# 23. Phase 1 開発開始時のDefinition of Ready

Issue #13を完了し、本格的な戦闘実装へ進む前に以下を満たす。

- [ ] React + TypeScript + Viteで起動できる
- [ ] Three.js / React Three Fiberが描画できる
- [ ] 最小3D Sceneが表示できる
- [ ] Vitestが実行できる
- [ ] oxlint / oxfmtが動作する
- [ ] Type Checkを実行できる
- [ ] GitHub ActionsでTest / Buildを実行できる
- [ ] `game` と `rendering` が分離された初期構成になっている
- [ ] Game LogicがThree.jsへ直接依存しない
- [ ] Visual Cue / Audio Cueを将来的に分離できるイベント構造を用意できる

---

# 24. 現時点の決定事項まとめ

## 決定済み

- Webアプリとして実装する
- Reactを使用する
- TypeScriptを使用する
- Three.jsを使用する
- React Three Fiberを使用する
- 2.5D固定カメラ型の3Dボス戦にする
- Game LogicはPure TypeScriptを基本とする
- Game LogicとRendering / Audio / UIを分離する
- Visual Cue / Audio Cueを分離する
- Unit TestはVitestを第一選択とする
- CIはGitHub Actionsを使用する

## 第一候補だが変更可能

- Vite
- Drei
- Zustand
- React Testing Library
- Playwright

## Phase 2まで保留

- リアルタイム通信方式
- MediaPipeの具体利用方法
- 音声通信方式
- Role間通信プロトコル
- センサー技術
- IoT / 現実干渉方式

---

# 25. 最終方針

Phase 1では、

> **React + Three.js / React Three Fiberで、固定カメラ型の3Dボス戦を作る。**

ただしゲームルールはReactやThree.jsから独立させ、Pure TypeScriptとして構築する。

これにより、Phase 1では1人用ゲームとして高速に検証しつつ、Phase 2では同じGame Logicを利用したまま、3人Client・Role別Cue・センサー・リアルタイム通信へ拡張できる構造を目指す。
