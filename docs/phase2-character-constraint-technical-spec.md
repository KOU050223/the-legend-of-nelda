# Phase 2 Character Constraint Technical Spec

## 概要

Phase 2 の3人協力ゲームにおける、各プレイヤーキャラクターの制約を  
**どの技術で成立させるか**、および **どこで「技術の無駄遣い」を行うか** を定義する。

本プロダクトでは、単に制約をゲームルールとして実装するだけでなく、

- キャラクター設定と技術実装が直接つながっている
- 観客が見て「何をしているのか」が分かる
- 技術説明を聞いたときに「そこまでやる必要ある？」となる
- ただし本当に壊れたゲームにはしない

ことを重視する。

P0-3 では、各キャラについて

1. 制約
2. 技術的な実現方法
3. 技術の無駄遣いポイント
4. MVPで最低限やること
5. 余裕があれば追加すること

を決める。

---

# 基本方針

3人の制約と技術は、以下の対応で進める。

| キャラ | 制約 | 技術的な実現 |
| --- | --- | --- |
| オドルノDaisuke | ダンスしているため視界が安定しない | 3DダンスAnimation → Head Bone Motion → Camera Effect |
| Pay大輔 | 何を喋っても「わっしょーい」になる | Microphone → Voice Feature Analysis → Wasshoi Reconstruction |
| オラ大輔 | Keyboard / Mouse / Controllerを使えない | WebCam → AR Marker Tracking → Game Action |

3人とも、

> **もっと簡単な実装方法があるのに、キャラ設定を守るためだけに妙に技術を使う**

状態を目指す。

---

# オドルノDaisuke — 見ざる

## 制約

オドルノDaisukeは本人が常に踊っている。

そのため、本人の視界もダンス中のように常に動いており、  
普通のプレイヤーのように安定した視界で周囲を見ることができない。

「完全に見えない」のではなく、

> **見えているが、視界が踊っているためまともに見続けられない**

状態を作る。

---

## 技術的な実現方法

単純なランダムCamera Shakeではなく、  
**実際のダンスアニメーション上の頭部の動きをカメラへ反映する**。

```text
Daisukeのダンスアニメーション
        ↓
Skeleton
        ↓
Head Bone / Chest Bone の位置・回転
        ↓
DanceMotionSampler
        ↓
Camera Effect
        ↓
プレイヤー視界
```

Three.js / React Three Fiber 上で、

- GLBキャラクターを読み込む
- ダンスAnimationを再生する
- Head BoneなどのTransformを取得する
- 基準姿勢との差分を抽出する
- 差分を減衰・平滑化してCameraへ適用する

構成とする。

---

## 実装方針

CameraをHead Boneへ直接Parentするのではなく、

```text
通常のFollow Camera
+
Dance Camera Offset
```

として扱う。

例：

```text
Head Bone Rotation Delta
        ↓
Scale 0.25〜0.4
        ↓
Smoothing / Low-pass
        ↓
Camera Offset
```

Head Boneの動きを100%反映すると画面酔いや破綻につながるため、  
**実際の骨格動作を元にしつつ、ゲームとして遊べるように減衰する**。

---

## 技術の無駄遣いポイント

普通にCamera Shakeを書けば済むところを、

> **ダンス中のSkeletonを追跡し、本人の頭部姿勢から視界を再構成する**

ためだけに3Dアニメーション・Bone Trackingを利用する。

発表時には、

> 「カメラを適当に揺らしているのではなく、  
> キャラクターのダンスモーション上の頭部姿勢を追跡して、  
> 踊っている本人の視界を再現しています」

と説明できる状態を目指す。

---

## MVP

必須：

- [ ] ダンスAnimationを1つ再生できる
- [ ] Head BoneまたはChest BoneのTransformを取得できる
- [ ] Boneの動きをCamera Offsetへ反映できる
- [ ] 揺れ量を調整できる
- [ ] 見づらいが操作可能な範囲へClampできる

---

## 追加候補

余裕があれば以下を追加する。

- BGMのBPMにダンスAnimation Speedを同期する
- 曲の盛り上がりに応じて視界の揺れ量を増やす
- UIの一部も微妙にダンスさせる
- 特定の重要情報が見づらくなる演出
- 「見ようとするとUIが逃げる」演出

ただし、P0-3の中核はあくまで

> **Dance Animation → Skeleton → Camera**

とする。

---

# Pay大輔 — 言わざる

## 制約

Pay大輔は普通に喋ることができる。

ただし、何を喋っても他プレイヤーには  
**「わっしょーい」** としてしか伝わらない。

例：

```text
Pay本人：
「右！右！早く逃げて！」

        ↓

他プレイヤー：
「わっしょーい！わっしょーい！」
```

元の言葉そのものは伝えない。

---

## 技術的な実現方法

本人の発話内容は利用しない。

その代わり、発話から

- 発話開始 / 終了
- 音量
- 発話時間
- 発話の区切り
- Pitch
- テンポ / 抑揚

などを解析し、  
その特徴を反映した「わっしょーい」を生成する。

```text
Microphone
        ↓
getUserMedia
        ↓
AudioContext / AudioWorklet
        ↓
VAD
RMS / Volume
Duration
Pitch
Burst Count
        ↓
WasshoiEngine
        ↓
WasshoiEvent
        ↓
本人の「わっしょーい」音声を変形
        ↓
他プレイヤーへ再生
```

---

## わっしょーい音声

外部動画等から特定人物の音声を抽出する前提にはしない。

ゲーム開始時、Pay大輔役本人に  
「わっしょーい」を録音してもらう方式を基本とする。

例：

```text
1. 普通
「わっしょーい！」

2. 小声
「わっしょーい…」

3. 絶叫
「わっしょおおおい！！！」
```

この本人音声を、プレイ中の発話特徴に合わせて加工・再生する。

---

## 変換例

```text
入力：
「右！」

短い / 大声
        ↓
「わっしょい！」
```

```text
入力：
「逃げろおおおお！！！」

長い / 大声 / 高Pitch
        ↓
「わっしょおおおおおい！！！」
```

```text
入力：
「右！右！右！」

短い発話が3回
        ↓
「わっしょい！わっしょい！わっしょい！」
```

---

## マルチプレイ時の考え方

元音声そのものを他プレイヤーへ送る必要はない。

```text
Pay Client
        ↓
音声特徴解析
        ↓
WasshoiEvent

{
  intensity,
  durationMs,
  pitch,
  burstCount
}

        ↓
WebSocket / WebRTC DataChannel
        ↓
Other Clients
        ↓
Wasshoi再生
```

元音声ではなく、  
**発話特徴量だけをイベントとして送信し、受信側で「わっしょーい」を再構成する**。

---

## 技術の無駄遣いポイント

普通ならマイク音声をそのままVoice Chatへ流せばよい。

しかしPay大輔では、

> **内容は全部捨てるのに、音声特徴だけは無駄にリアルタイム解析する**

ためにAudio Processingを行う。

発表時には、

> 「リアルタイムでVAD・音量・発話長・Pitchなどを解析しています。  
> ただし内容は全部捨てて、最終的には『わっしょーい』になります」

と言える状態を目指す。

---

## MVP

必須：

- [ ] Microphone入力を取得できる
- [ ] 発話開始 / 終了を検出できる
- [ ] 音量を取得できる
- [ ] 発話時間を取得できる
- [ ] 本人の「わっしょーい」を録音できる
- [ ] 発話ごとに「わっしょーい」を再生できる
- [ ] 音量・長さを最低限反映できる

---

## 追加候補

余裕があれば、

- Pitch解析
- 発話の区切り検出
- 発話テンポ反映
- playbackRate変更
- Pitch Shift
- Loop / Time Stretch
- 複数Wasshoi Sampleの自動選択

を追加する。

最初から高度な音声変換を必須にしない。

---

# オラ大輔 — せざる

## 制約

オラ大輔は、

- Keyboard
- Mouse
- 一般的なGame Controller

を使って直接操作できない。

「せざる」の力により、  
**通常の入力デバイスを使わずにゲームを操作する**。

---

## 採用技術

MVPでは、

> **ARマーカーを身体または手に装着し、Webカメラから追跡してゲーム入力へ変換する**

方式を採用する。

MediaPipe Poseのような一般的な身体認識だけで完結させるのではなく、  
見た目にも技術の無駄遣いが伝わる方式を優先する。

---

## 技術的な実現方法

```text
WebCam
        ↓
AR Marker Detection
        ↓
Marker Position / Size / Velocity / Rotation
        ↓
OraInputAdapter
        ↓
MOVE
ATTACK
DODGE
INTERACT
```

フルモーションキャプチャは狙わない。

MVPでは1〜2枚のマーカーから、

- 中心座標
- 画面内位置
- Marker Size
- フレーム間移動量
- 必要に応じてRotation

を取得し、Game Actionへ変換する。

---

## 操作割り当て候補

現時点では以下を候補とする。

| 身体 / マーカー動作 | Game Action |
| --- | --- |
| マーカーを左へ移動 | 左移動 |
| マーカーを右へ移動 | 右移動 |
| 上下 / Size変化 | 前進・後退の候補 |
| 素早く横へ振る | ATTACK |
| 大きく振る / 特定動作 | DODGE |
| 特定位置で静止 | INTERACT |

具体的な閾値・ジェスチャーはPoCで調整する。

---

## アーキテクチャ

ARマーカー認識処理をゲームロジックへ直接結合しない。

```text
MarkerInputAdapter
        ↓
GameAction
        ↓
MOVE
ATTACK
DODGE
INTERACT
REVIVE
```

とする。

ゲームロジック側は、

> 「どのデバイスから入力されたか」

を意識しない。

これにより、ARマーカー認識が不安定な場合でも

```text
MediaPipeInputAdapter
SmartphoneInputAdapter
DebugKeyboardInputAdapter
```

などへ差し替えられる構造にする。

---

## 技術の無駄遣いポイント

普通ならWASDやGamepadで操作すればよい。

しかしオラ大輔では、

> **キーボードを使えないという設定だけのために、身体へARマーカーを装着し、Webカメラでリアルタイム追跡してゲーム操作へ変換する**

。

発表時には、

> 「複数のFiducial MarkerをWebカメラからリアルタイム追跡して、  
> 位置・速度・姿勢をゲーム入力へ変換しています」

と説明したあと、

> 「理由はオラ大輔がキーボードを触れないからです」

で成立する設計を目指す。

---

## 見た目の方針

実際の認識に必要なMarkerが1〜2枚でも、  
演出上は身体へ複数のMarkerを装着してよい。

目的は、

> **身体中に謎のマーカーを貼った人間が、PCの前でゲーム操作している**

という見た目を作ること。

ただし、見た目のために認識精度や実装難易度を大きく悪化させない。

---

## MVP

必須：

- [ ] WebCam入力を取得できる
- [ ] AR Markerを1枚検出できる
- [ ] Marker中心座標を取得できる
- [ ] Marker移動量を取得できる
- [ ] MOVEへ変換できる
- [ ] ATTACKまたはDODGEのどちらかをジェスチャーで発火できる
- [ ] OraInputAdapter経由でGame Actionへ変換できる

---

## 追加候補

余裕があれば、

- Markerを2〜3枚へ増やす
- Rotationを利用する
- 両手Markerの相対位置で専用Actionを発動する
- 複数Markerを使った簡易姿勢推定
- スマホIMUとの複合入力
- AirPods Head Motionとの連携

を検討する。

ただし本番中は、複数Markerによるフルモーションキャプチャを必須にしない。

---

# Web完結方針

Phase 2 は、可能な限りWebで完結する。

現時点の方針では、

## オドルノDaisuke

Three.js / React Three Fiber上で完結可能。

```text
GLB
→ Animation
→ Skeleton
→ Camera
```

## Pay大輔

Web Audio API / AudioWorkletで完結可能。

```text
getUserMedia
→ Audio Analysis
→ WasshoiEvent
```

## オラ大輔

WebCam + JavaScript上のMarker Trackingで完結可能。

```text
getUserMedia(video)
→ Marker Detection
→ OraInputAdapter
```

Unityは必須としない。

既存のReact + Three.js / React Three Fiber基盤を維持する。

---

# フォールバック方針

ハッカソン本番では、技術的な面白さより  
**最後まで動くことを優先する**。

そのため、各機能は可能な限りフォールバックを持つ。

## オドルノ

Head Bone Trackingが失敗した場合：

```text
Predefined Dance Camera Curve
```

へ切り替え可能にする。

## Pay

Pitch解析等が不安定な場合：

```text
VAD + Volume + Duration
```

のみで成立させる。

## オラ

AR Marker Trackingが不安定な場合：

```text
MediaPipeInputAdapter
```

等へ差し替え可能な構造にする。

---

# PoC優先順位

技術リスクが高い順にPoCする。

## 1. オラ大輔

最優先。

理由：

- 入力方式そのものが特殊
- カメラ環境に依存する
- 認識精度がゲーム成立に直結する

まず、

```text
Markerを1枚検出
↓
左右移動
↓
ATTACK
```

までを確認する。

---

## 2. Pay大輔

次点。

まず、

```text
Microphone
↓
VAD
↓
Volume
↓
本人のWasshoi Sample再生
```

まで成立させる。

その後、Pitch・発話区切りを追加する。

---

## 3. オドルノDaisuke

技術リスクは比較的低い。

まず、

```text
Dance Animation
↓
Head Bone
↓
Camera Offset
```

を成立させる。

視界揺れ量はプレイテストで調整する。

---

# P0-3 完了判定

以下を決定したため、P0-3「各キャラの制約をどう技術で成立させるか」は完了扱いとする。

- [x] オドルノDaisukeの制約実現方式を決定
- [x] Pay大輔の制約実現方式を決定
- [x] オラ大輔の制約実現方式を決定
- [x] 3キャラともWebを中心に実現可能な方向へ整理
- [x] 技術の無駄遣いポイントを定義
- [x] MVP範囲と追加要素を分離
- [x] フォールバック方針を定義
- [x] PoC優先順位を定義

---

# 次に決めること

P0-3完了後は、以下を進める。

## P0-4 オラ大輔の代替入力・専用アクション

- ARマーカーの具体的な操作割り当て
- MOVE / ATTACK / DODGE / INTERACTの認識方法
- オラ大輔にしかできない専用アクション
- 特殊フェーズでの利用方法

## PoC

以下を小さく実装して技術リスクを確認する。

1. AR Marker → Game Action
2. Voice Feature → Wasshoi
3. Dance Bone Motion → Camera

---

## 関連

- `docs/phase2-gameplay-spec.md`
- `docs/phase2-role-design-spec.md`
- Issue #42: Worldbuilding
- Issue #45: 三人の大輔の制約・強み
