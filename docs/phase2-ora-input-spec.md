# Phase 2 Ora Daisuke Input Spec

## 概要

Phase 2 におけるオラ大輔の代替入力方式と専用アクションを定義する。

オラ大輔は「せざる」の力により、通常のプレイヤーが使う

- Keyboard
- Mouse
- Game Controller

を直接操作できない。

そのため、**ARマーカーを身体・手に装着し、Webカメラで追跡してゲーム操作へ変換する**。

P0-4では、通常操作と専用アクションを含めて、PoCへそのまま移せる状態まで仕様を固定する。

---

# 基本方針

オラ大輔は、単に「変な方法で普通の操作をするキャラ」にはしない。

通常操作そのものをARマーカー経由で行いつつ、

> **オラ大輔にしか実行できない専用アクション**

を持たせる。

これにより、

- 通常戦闘にも参加できる
- 他2人では代替できない役割がある
- 「せざる」という制約がゲーム攻略上の強みに変わる

状態を作る。

---

# 入力デバイス

## 採用方式

MVPでは、**両手にARマーカーを1枚ずつ装着**する。

```text
左手：LEFT MARKER
右手：RIGHT MARKER
```

Webカメラで両方を追跡し、

- 座標
- 距離
- サイズ
- 移動速度
- 必要に応じてRotation

を取得する。

フルモーションキャプチャは行わない。

---

# 入力アーキテクチャ

ARマーカー認識をゲームロジックへ直接結合しない。

```text
WebCam
  ↓
MarkerDetector
  ↓
MarkerObservation
  ↓
OraGestureRecognizer
  ↓
OraInputAdapter
  ↓
GameAction
```

ゲーム側は、入力元がARマーカーかどうかを意識しない。

扱うGameActionは以下とする。

```text
MOVE
ATTACK
DODGE
INTERACT
REVIVE
ORA_ACTION
```

---

# MarkerObservation

最低限、左右マーカーについて以下の情報を持つ。

```ts
type MarkerObservation = {
  left?: {
    x: number
    y: number
    size: number
    velocityX: number
    velocityY: number
  }
  right?: {
    x: number
    y: number
    size: number
    velocityX: number
    velocityY: number
  }
}
```

必要に応じてRotationやConfidenceを後から追加する。

---

# 通常操作

## MOVE

### 目的

オラ大輔をフィールド内で移動させる。

### MVP案

左右マーカーの中心座標から移動方向を決める。

```text
両手マーカーの中心位置
        ↓
画面中心との差分
        ↓
MOVE方向
```

候補：

- 中心より左 → 左移動
- 中心より右 → 右移動
- 上下位置またはMarker Size変化 → 前進 / 後退

前後移動の具体判定はPoCで調整する。

---

## ATTACK

### 操作

**右手マーカーを素早く振る**。

### 判定

```text
RIGHT MARKER
        ↓
一定時間内の移動速度を計測
        ↓
velocity > threshold
        ↓
ATTACK
```

誤発火防止のため、

- 最低速度
- 最低移動距離
- Cooldown

を持たせる。

ATTACKは1回のジェスチャーにつき1回だけ発火する。

---

## DODGE

### 操作

**両手マーカーを同じ方向へ大きく素早く振る**。

例：

```text
LEFT MARKER  →
RIGHT MARKER →
```

### 判定

- 左右マーカーが同方向へ動いている
- 一定速度以上
- 一定距離以上

を満たした場合にDODGEを発火する。

ATTACKとの誤判定を避けるため、右手単独の高速移動とは分離する。

---

## INTERACT

### 目的

通常の装置・オブジェクト操作に使用する。

### MVP案

対象付近で、

> **両手マーカーを一定位置に置き、短時間静止する**

ことでINTERACTを発火する。

誤操作を避けるため、移動ジェスチャーよりも意図的な操作にする。

具体的なポーズはPoCで決定する。

---

# 蘇生

## REVIVE

プレイヤーのHPが0になると、布団に入り寝ようとする。

オラ大輔が蘇生する場合も、Keyboard / Mouse入力は使用しない。

### 操作

寝ようとしている味方の近くで、

> **右手マーカーを上下に繰り返し動かす**

。

```text
↑
↓
↑
↓
```

この動きを「寝るな！」連打に対応させる。

### 判定

- 蘇生対象の近くにいる
- 右手マーカーが上下方向へ一定回数往復している
- 一定時間内に必要回数を満たす

ことでREVIVE進行度を増加させる。

---

# オラ大輔専用アクション

## ORA_ACTION

オラ大輔だけが使用できる特殊アクション。

通常のKeyboard / Mouse / Controllerでは発動できない。

---

## 操作

**両手を頭上へ上げ、V字のような形を約1秒維持する**。

イメージ：

```text
   LEFT        RIGHT
     \          /
      \        /
       \      /
        \    /
         \  /
          \/
        PLAYER
```

観客から見ても、

> 「急に謎の儀式を始めた」

と分かる見た目を重視する。

---

## 判定

以下を同時に満たす。

```text
LEFT MARKERが高い位置
        +
RIGHT MARKERが高い位置
        +
左右Markerが十分離れている
        +
約1秒維持
        ↓
ORA_ACTION
```

具体的には、

- `left.y < upperThreshold`
- `right.y < upperThreshold`
- `abs(left.x - right.x) > minSpread`
- 条件成立状態を約1秒維持

といった単純な座標条件から開始する。

Pose Recognitionそのものを導入する必要はない。

---

# ORA_ACTIONのMVP効果

MVPでは、

> **オラ大輔にしか操作できない特殊装置を起動し、ショートスリーパー結界へ干渉する**

能力とする。

代表的な流れ：

```text
堀大輔
ショートスリーパー結界を発動
        ↓
複数の特殊装置が出現
        ↓
Pay大輔
正解の装置を特定
        ↓
オドルノDaisuke
高機動で現場を確保
        ↓
オラ大輔
対象装置の近くへ移動
        ↓
V字ポーズを約1秒維持
        ↓
ORA_ACTION
        ↓
特殊装置起動
        ↓
結界へダメージ / 結界解除
```

これにより、

- Pay大輔 = 何をすべきか知る
- オドルノDaisuke = 現場へ行く / 時間を作る
- オラ大輔 = 実際に特殊操作を実行する

というP0-2の役割分担と接続する。

---

# ORA_ACTIONの追加候補

MVPでは特殊装置操作だけに限定する。

余裕があれば、同じ入力システムから以下を追加できる。

- ボスを短時間拘束
- 一時バリア生成
- 安全地帯生成
- 味方への一時バフ
- フィールドギミック起動
- 特殊フェーズ専用装置操作

ただし、MVP段階では能力を増やしすぎない。

---

# 誤発火防止

ARマーカー入力では、認識ノイズによる誤操作を防ぐ必要がある。

各Actionに以下を持たせる。

## Cooldown

同じActionが短時間に連続発火しないようにする。

例：

```text
ATTACK: 300〜500ms
DODGE: 700〜1000ms
ORA_ACTION: 発動後1〜2秒
```

具体値はPoCで調整する。

## Hold

ORA_ACTIONやINTERACTは、1Frameだけ条件を満たしても発動しない。

一定時間継続して条件を満たした場合のみ発火する。

## Hysteresis

境界付近で入力がON/OFFを繰り返さないよう、開始閾値と解除閾値を分ける。

## Marker Lost

マーカーを見失った場合、

- 新しいActionを発火しない
- 現在の移動入力をNeutralへ戻す
- 再検出後に自動復帰する

ようにする。

---

# デバッグ入力

プレイヤー仕様としてKeyboard / Mouseは禁止するが、  
開発時のデバッグまで禁止しない。

```text
OraInputAdapter
├─ MarkerInputAdapter
└─ DebugKeyboardInputAdapter
```

とし、開発環境ではKeyboardから同じGameActionを発火できるようにする。

これにより、

- Marker認識とは独立してゲームロジックをテストできる
- ボス戦やギミック実装をAR入力完成まで止めなくてよい
- 本番環境ではMarkerInputAdapterのみ使用できる

ようにする。

---

# PoC実装順序

全部を同時に実装しない。

## Step 1: Camera / Marker Detection

```text
WebCam起動
↓
LEFT / RIGHT Marker検出
↓
座標をDebug表示
```

### 成功条件

- 2枚を区別できる
- 座標がリアルタイム更新される
- Marker Lost後に再認識できる

---

## Step 2: MOVE

```text
Marker Position
↓
MOVE
```

キャラクターまたはDebug Objectを左右へ動かせるところまで確認する。

---

## Step 3: ATTACK

```text
RIGHT MARKER Velocity
↓
ATTACK
```

右手を振ると1回だけ攻撃が発火することを確認する。

---

## Step 4: ORA_ACTION

```text
V字ポーズ
↓
約1秒Hold
↓
ORA_ACTION
```

Debug UI上で、

```text
ORA POSE: 0%
...
ORA POSE: 100%

ORA ACTION!
```

のように確認できる状態にする。

---

## Step 5: DODGE / REVIVE / INTERACT

MOVE / ATTACK / ORA_ACTIONが安定してから追加する。

---

# PoC完了条件

以下を満たした場合、オラ大輔AR入力PoCを成功とする。

- [ ] Webカメラをブラウザから取得できる
- [ ] 左右2枚のARマーカーを区別できる
- [ ] 両マーカーの座標をリアルタイム取得できる
- [ ] Marker Lost後に復帰できる
- [ ] MOVEをARマーカーだけで操作できる
- [ ] 右手を振るとATTACKが1回だけ発火する
- [ ] V字ポーズを約1秒維持するとORA_ACTIONが1回発火する
- [ ] 静止中にActionが勝手に連発しない
- [ ] Keyboard / Mouseを使わずデモ操作できる

---

# フォールバック

AR Marker方式が本番環境で安定しない場合でも、  
ゲームロジックを作り直さなくて済むようにInput Adapterを分離する。

候補：

```text
MediaPipeInputAdapter
SmartphoneInputAdapter
DebugKeyboardInputAdapter
```

本番の第一候補はAR Markerだが、  
技術的な面白さより「最後まで動くこと」を優先する。

---

# P0-4 完了判定

以下を決定したため、P0-4「オラ大輔の代替入力・専用アクション」は完了扱いとする。

- [x] 代替入力方式をARマーカーに決定
- [x] 両手にARマーカーを装着する方針を決定
- [x] MOVEの入力方針を決定
- [x] ATTACKのジェスチャーを決定
- [x] DODGEのジェスチャー方針を決定
- [x] REVIVEのジェスチャーを決定
- [x] INTERACTの方針を決定
- [x] オラ大輔専用のORA_ACTIONを定義
- [x] ORA_ACTIONのMVP効果を定義
- [x] 誤発火防止方針を定義
- [x] Debug入力・フォールバック方針を定義
- [x] PoC実装順序と成功条件を定義

---

# 次に進むこと

P0-4完了後は、設計よりPoCを優先する。

最優先：

> **AR Marker → MOVE / ATTACK / ORA_ACTION**

を実際のWeb環境で成立させる。

その後、

1. Pay大輔のWasshoi PoC
2. オドルノDaisukeのDance Camera PoC

へ進む。

---

## 関連

- `docs/phase2-gameplay-spec.md`
- `docs/phase2-role-design-spec.md`
- `docs/phase2-character-constraint-technical-spec.md`
- Issue #45: 三人の大輔の制約・強み
