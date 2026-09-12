# Phase 1 Single Player Test Specification

## 0. このドキュメントの目的

本ドキュメントは、Phase 1「1人用ボス戦PoC」に対する**具体的なテストケース**を定義する。

全体方針は [`docs/testing-strategy.md`](../testing-strategy.md) に従い、ゲーム仕様は [`docs/single-player-poc-spec.md`](../single-player-poc-spec.md) を正とする。

このPhaseでは以下を重点的に検証する。

- 戦闘State Machine
- 左回避 / 右回避 / ガード / 攻撃
- 入力受付時間と境界値
- 3種類のボス技
- Boss HP / HORI SLEEPINESS
- 反撃Window
- チュートリアル / 本戦シーケンス
- Visual Cue / Audio Cueの分離
- 勝利 / 敗北
- 1戦を最後まで通せること

---

# 1. テスト対象Issue

| Issue | 対象 |
|---|---|
| #2 | 戦闘ステートマシン |
| #3 | プレイヤー基本操作 / 入力判定 |
| #4 | ボス攻撃共通基盤 |
| #5 | Boss HP / SLEEPINESS / Damage |
| #6 | 枕薙ぎ払い |
| #7 | あくび衝撃波 |
| #8 | 究極奥義・ふかふか布団 |
| #9 | HUD / Event UI |
| #10 | チュートリアル / 本戦シーケンス |
| #11 | SE / VFX / Hit Feedback |
| #12 | 勝利 / 敗北 / 撃破演出 |
| #14 | 通しプレイ / バランス調整 |

原則として、各Issueは対応する必須テストが成功するまでDoneにしない。

---

# 2. テストIDルール

以下のPrefixを使用する。

| Prefix | 分類 |
|---|---|
| `SM` | State Machine |
| `INPUT` | プレイヤー入力 |
| `HP` | HP / SLEEPINESS / Damage |
| `ATK-BASE` | 共通攻撃基盤 |
| `PILLOW` | 枕薙ぎ払い |
| `YAWN` | あくび衝撃波 |
| `FUTON` | ふかふか布団 |
| `CUE` | Visual / Audio Cue |
| `SEQ` | チュートリアル / 本戦シーケンス |
| `UI` | HUD / Event UI |
| `RESULT` | 勝利 / 敗北 |
| `E2E` | 通しシナリオ |
| `MANUAL` | 手動 / Playtest |

例:

```text
PILLOW-001
INPUT-004
E2E-001
```

---

# 3. 共通テスト前提

## 3.1 FakeClock

時間依存のテストでは実時間待機を避ける。

以下のようなテスト用Clockを利用できる状態を推奨する。

```text
GameClock
├─ RealClock
└─ FakeClock
```

テストでは着弾時刻を `t = 0.0` として扱う。

## 3.2 FixedRandom

左右ランダム攻撃などは、テスト時に結果を固定できること。

```text
RandomProvider
├─ ProductionRandom
└─ FixedRandom
```

## 3.3 Test Doubles

必要に応じて以下を差し替える。

- AudioOutput
- VisualOutput
- UIOutput
- RandomProvider
- GameClock

---

# 4. State Machine テスト

対象Issue: #2

## SM-001 正常な攻撃サイクル

**Given**
- State = `IDLE`
- ダミー攻撃を開始可能

**When**
- 攻撃を開始する
- 正解入力を行う
- 反撃を行う

**Then**

```text
IDLE
→ TELEGRAPH
→ ATTACK
→ JUDGE
→ COUNTER_WINDOW
→ DAMAGE
→ IDLE
```

の順に遷移する。

---

## SM-002 被弾時の遷移

**When**
- `ATTACK` 中に失敗判定になる

**Then**

```text
ATTACK
→ JUDGE
→ HIT
→ IDLE
```

へ遷移する。

---

## SM-003 勝利遷移

**Given**
- Boss HP = 1

**When**
- 1以上のダメージを与える

**Then**
- `BOSS_DEFEATED` へ遷移する
- 以後通常攻撃Stateへ戻らない

---

## SM-004 敗北遷移

**Given**
- SLEEPINESS = 99

**When**
- SLEEPINESS +1

**Then**
- `PLAYER_LOSE` へ遷移する
- 以後通常攻撃Stateへ戻らない

---

## SM-005 Stateの多重開始防止

**When**
- `ATTACK` 中に次のBoss Attack開始要求が来る

**Then**
- 2つの攻撃が同時に開始されない

---

# 5. プレイヤー入力テスト

対象Issue: #3

回避受付基準:

```text
着弾 -0.60 sec ～ +0.10 sec
```

ガード受付基準:

```text
着弾 -0.70 sec ～ +0.10 sec
```

## INPUT-001 左回避入力

左回避入力がPlayer Actionとして正しく通知される。

## INPUT-002 右回避入力

右回避入力がPlayer Actionとして正しく通知される。

## INPUT-003 ガード入力

ガード入力がPlayer Actionとして正しく通知される。

## INPUT-004 攻撃入力

攻撃入力がPlayer Actionとして正しく通知される。

---

## INPUT-005 回避受付開始直前

**Input:** `t = -0.61`

**Expected:**
- 成功扱いにならない
- `TOO EARLY`
- 0.3〜0.5秒の硬直対象

---

## INPUT-006 回避受付開始境界

**Input:** `t = -0.60`

**Expected:** 成功判定可能

---

## INPUT-007 回避受付終了境界

**Input:** `t = +0.10`

**Expected:** 成功判定可能

---

## INPUT-008 回避受付終了直後

**Input:** `t = +0.11`

**Expected:** 遅すぎる / 被弾

---

## INPUT-009 ガード受付開始直前

**Input:** `t = -0.71`

**Expected:** 早押し扱い

## INPUT-010 ガード受付開始境界

**Input:** `t = -0.70`

**Expected:** 成功判定可能

## INPUT-011 ガード受付終了境界

**Input:** `t = +0.10`

**Expected:** 成功判定可能

## INPUT-012 ガード受付終了直後

**Input:** `t = +0.11`

**Expected:** 失敗

---

## INPUT-013 回避連打防止

**Given**
- 回避入力を1回受理済み

**When**
- 0.7秒以内に再度回避入力

**Then**
- 2回目は受理されない

---

## INPUT-014 反撃Window外の攻撃

**When**
- `COUNTER_WINDOW` 以外で攻撃入力

**Then**
- Damageを与えない
- `WHIFF`
- 約0.4秒硬直

---

# 6. HP / SLEEPINESS / Damage テスト

対象Issue: #5

## HP-001 Boss HP初期値

**Expected:** 100

## HP-002 枕反撃Damage

**Given:** Boss HP = 100

**When:** 枕薙ぎ払い後の反撃成功

**Then:** Boss HP = 90

## HP-003 あくび反撃Damage

**Given:** Boss HP = 100

**When:** あくび衝撃波後の反撃成功

**Then:** Boss HP = 85

## HP-004 布団カウンターDamage

**Given:** Boss HP = 100

**When:** ふかふか布団カウンター成功

**Then:** Boss HP = 70

---

## HP-005 Boss HPは0未満にならない

**Given:** Boss HP = 5

**When:** 30 Damage

**Then:**
- Boss HP表示値は0以下にならないことを推奨
- 勝利判定が1回だけ発火する

---

## HP-006 SLEEPINESS 99 → 100

**Expected:** 敗北判定

## HP-007 SLEEPINESS 98 → 99

**Expected:** 敗北しない

## HP-008 SLEEPINESS上限

100を超えるDamageを受けても、表示・内部仕様に応じて100へClampするか、少なくとも敗北イベントが重複発火しない。

---

# 7. 共通攻撃基盤テスト

対象Issue: #4

## ATK-BASE-001 攻撃パラメータ定義

1つのBoss Attackに以下を保持できる。

- Attack Type
- Direction
- Visual Cue
- Audio Cue
- Hit Timing
- Correct Action
- Counter Window
- Damage
- Sleepiness Damage

---

## ATK-BASE-002 Visual Cueを無効化可能

Visual CueをOFFにしても、
- State遷移
- Hit判定
- Damage判定

が壊れない。

---

## ATK-BASE-003 Audio Cueを無効化可能

Audio CueをOFFにしてもゲームロジックが壊れない。

---

## ATK-BASE-004 Visual / Audio Cueの個別購読

Visual CueとAudio Cueを別々に購読できる。

---

## ATK-BASE-005 攻撃終了後のイベント解放

攻撃終了後に古いCueやInput listenerが残り、次攻撃へ干渉しない。

---

# 8. 枕薙ぎ払い テスト

対象Issue: #6

## PILLOW-001 右攻撃 → 左回避

**Expected:** `PERFECT DODGE`

## PILLOW-002 左攻撃 → 右回避

**Expected:** `PERFECT DODGE`

## PILLOW-003 右攻撃 → 右回避

**Expected:** 被弾

## PILLOW-004 左攻撃 → 左回避

**Expected:** 被弾

## PILLOW-005 枕にガード

**Expected:** 技選択ミス / 被弾

## PILLOW-006 早すぎる正解方向回避

**Input:** `t = -0.61`

**Expected:** `TOO EARLY`、成功しない

## PILLOW-007 回避成功後Counter Window

**Expected:** 約1.5秒の反撃可能状態

## PILLOW-008 Counter Window内の攻撃

**Expected:** Boss HP -10

## PILLOW-009 Counter Window外の攻撃

**Expected:** Damage 0 / `WHIFF`

## PILLOW-010 被弾時SLEEPINESS増加

仕様上設定された枕用SLEEPINESS Damageが1回だけ加算される。

---

# 9. あくび衝撃波 テスト

対象Issue: #7

## YAWN-001 正しいタイミングのガード

**Expected:** `JUST GUARD`

## YAWN-002 左回避を入力

**Expected:** 失敗 / 被弾

## YAWN-003 右回避を入力

**Expected:** 失敗 / 被弾

## YAWN-004 ガード早押し

**Input:** `t = -0.71`

**Expected:** 成功しない

## YAWN-005 ガード開始境界

**Input:** `t = -0.70`

**Expected:** 成功

## YAWN-006 ガード終了境界

**Input:** `t = +0.10`

**Expected:** 成功

## YAWN-007 ガード終了直後

**Input:** `t = +0.11`

**Expected:** 被弾

## YAWN-008 JUST GUARD後Counter Window

**Expected:** 約2秒

## YAWN-009 反撃成功Damage

**Expected:** Boss HP -15

## YAWN-010 被弾時SLEEPINESS増加

設定された値が1回だけ加算される。

---

# 10. ふかふか布団 テスト

対象Issue: #8

## FUTON-001 右布団 → 左回避

**Expected:** 第1段階成功

## FUTON-002 左布団 → 右回避

**Expected:** 第1段階成功

## FUTON-003 同方向へ回避

**Expected:** `GOOD NIGHT` / 被弾

## FUTON-004 回避成功後0.80秒で攻撃

**Expected:** カウンター成功

## FUTON-005 回避成功後0.81秒で攻撃

**Expected:** カウンター失敗

## FUTON-006 回避成功・攻撃なし

**Expected:**
- 被弾しない
- 大ダウン発生なし
- 次攻撃へ進行

## FUTON-007 カウンター成功Damage

**Expected:** Boss HP -30

## FUTON-008 カウンター成功後大ダウン

**Expected:** 約2.5〜3秒の反撃可能状態

## FUTON-009 回避失敗時SLEEPINESS

**Expected:** 大きなSLEEPINESS Damageが1回加算

## FUTON-010 カウンター多重入力防止

成功後に連打してもDamage / Counter Eventが複数回発生しない。

---

# 11. Cue分離テスト

対象Issue: #4 #6 #7 #8 #11

Phase 2へ安全に移行するための重要テスト。

## CUE-001 Visual Cue OFF + 枕

**Expected:**
- 攻撃ロジックは正常
- Visual出力だけ発生しない
- Audio Cueは発生する

## CUE-002 Audio Cue OFF + 枕

**Expected:**
- 攻撃ロジックは正常
- Audio出力だけ発生しない
- Visual Cueは発生する

## CUE-003 Visual Cue OFF + あくび

攻撃判定そのものは正常に進行する。

## CUE-004 Audio Cue OFF + あくび

無音でも内部Hit Timingは変化しない。

## CUE-005 CueがHPを書き換えない

Visual / Audio Cue発火のみではBoss HP・SLEEPINESSが変化しない。

## CUE-006 Cue多重発火防止

1攻撃のVisual / Audio Cueが意図せず複数回開始されない。

---

# 12. チュートリアル / シーケンステスト

対象Issue: #10

## SEQ-001 チュートリアル順序

以下の順番で開始される。

```text
1. 枕薙ぎ払い Tutorial
2. 枕薙ぎ払い Normal
3. あくび衝撃波 Tutorial
4. あくび衝撃波 Normal
5. ふかふか布団 Tutorial
```

---

## SEQ-002 チュートリアル終了後本戦へ遷移

5ステップ完了後、本戦Stateへ入る。

---

## SEQ-003 Tutorial補助表示

Tutorial時のみ必要な操作補助表示を有効化できる。

## SEQ-004 本戦では答えを直接表示しない

本戦時に `LEFT NOW` / `GUARD NOW` のような正解そのものを表示しない。

---

## SEQ-005 本戦固定シーケンス

初期実装では以下を通せる。

```text
Pillow
Yawn
Pillow
Yawn
Futon
Pillow or Yawn
Final Futon
```

---

## SEQ-006 ランダム枠を固定可能

テスト時は `Pillow or Yawn` をFixedRandomで任意に固定できる。

---

# 13. UI状態テスト

対象Issue: #9

UIの見た目そのものはManual Test対象とし、ここでは状態連動をテストする。

## UI-001 Boss HP更新

Boss HP変更時にHUD表示値が更新される。

## UI-002 SLEEPINESS更新

SLEEPINESS変更時にHUD表示値が更新される。

## UI-003 PERFECT DODGE表示

回避成功時のみ表示される。

## UI-004 JUST GUARD表示

ガード成功時のみ表示される。

## UI-005 TOO EARLY表示

早押し時のみ表示される。

## UI-006 WHIFF表示

反撃Window外攻撃時のみ表示される。

## UI-007 GOOD NIGHT表示

ふかふか布団回避失敗時に表示される。

## UI-008 Event UIの残留防止

イベント表示が次の攻撃まで残留しない。

---

# 14. 勝利 / 敗北テスト

対象Issue: #12

## RESULT-001 Boss HP 0で勝利

**Expected:** `BOSS_DEFEATED`

## RESULT-002 最終ふかふか布団FINISH

仕様としてFINISH採用時、最終布団カウンター成功で勝利演出へ進める。

## RESULT-003 SLEEPINESS 100で敗北

**Expected:** `PLAYER_LOSE`

## RESULT-004 勝利イベント1回のみ

Damage連打等で勝利イベントが複数回発火しない。

## RESULT-005 敗北イベント1回のみ

SLEEPINESSが100を超えても敗北イベントが複数回発火しない。

## RESULT-006 勝利後入力無効

勝利State後に通常攻撃・回避で戦闘が再開しない。

## RESULT-007 敗北後入力無効

敗北State後に戦闘処理が進まない。

## RESULT-008 Restart

リスタート後に以下が初期化される。

- Boss HP
- SLEEPINESS
- State
- Attack Sequence位置
- Input Lock
- Counter Window
- Event UI

---

# 15. E2E / Scenario Test

対象Issue: #14

## E2E-001 全成功シナリオ

**Scenario:**
- チュートリアル開始
- 全攻撃に正しく対応
- 必要な反撃を成功
- 最終ふかふか布団成功

**Expected:**
- 途中で進行停止しない
- Boss撃破
- 勝利演出まで到達

---

## E2E-002 敗北シナリオ

**Scenario:**
- 各攻撃を意図的に失敗
- SLEEPINESSを100まで上げる

**Expected:**
- `PLAYER_LOSE`
- 以後攻撃シーケンス停止

---

## E2E-003 失敗後も戦闘継続

**Scenario:**
- 枕を1回失敗
- 次攻撃以降は成功

**Expected:**
- 1回の失敗で進行が壊れない
- SLEEPINESSのみ増加
- 最終的に勝利可能

---

## E2E-004 ふかふか布団カウンター失敗後継続

**Scenario:**
- 回避成功
- 0.8秒以内の攻撃を失敗

**Expected:**
- 即敗北しない
- 大ダウンしない
- 次攻撃へ正常遷移

---

# 16. Manual / Playtest項目

対象Issue: #11 #14

自動化しない。実際に人間が遊んで確認する。

## MANUAL-001 枕の方向が読み取れる

ボスの左右モーションだけで、どちらから攻撃が来るか理解できるか。

## MANUAL-002 あくびのタイミングが音で分かる

吸気音 → 無音の変化がガード判断として機能するか。

## MANUAL-003 布団が大技に見える

通常技との差が一目で分かるか。

## MANUAL-004 入力受付がシビアすぎない

初見プレイヤーが理不尽だと感じないか。

## MANUAL-005 連打で突破できない

適当にボタンを連打しても安定クリアできないか。

## MANUAL-006 反撃が気持ちいい

回避 / ガード成功後に攻撃する流れが気持ちよく感じるか。

## MANUAL-007 1戦の長さ

成功中心で約60〜90秒に収まるか。

## MANUAL-008 UI視認性

Boss HP / SLEEPINESS / Event表示が戦闘を邪魔しないか。

## MANUAL-009 SE / VFXの強度

演出が弱すぎない / 強すぎないか。

## MANUAL-010 Phase 2へ分解できそうか

実際にプレイした上で、

- 視覚情報
- 聴覚情報
- 判断
- 操作

を3人へ分配できる手応えがあるか。

---

# 17. Issueごとの最低必須テスト

## #2 戦闘ステートマシン

必須:

- SM-001
- SM-002
- SM-003
- SM-004
- SM-005

## #3 プレイヤー基本操作 / 入力判定

必須:

- INPUT-001〜014

## #4 ボス攻撃共通基盤

必須:

- ATK-BASE-001〜005
- CUE-001〜006

## #5 HP / SLEEPINESS

必須:

- HP-001〜008

## #6 枕薙ぎ払い

必須:

- PILLOW-001〜010

## #7 あくび衝撃波

必須:

- YAWN-001〜010

## #8 ふかふか布団

必須:

- FUTON-001〜010

## #9 HUD / Event UI

自動:

- UI-001〜008

Manual:

- MANUAL-008

## #10 チュートリアル / 本戦

必須:

- SEQ-001〜006

## #11 SE / VFX

自動:

- CUE系テスト

Manual:

- MANUAL-001〜003
- MANUAL-006
- MANUAL-009

## #12 勝利 / 敗北

必須:

- RESULT-001〜008

## #14 最終調整

必須:

- E2E-001〜004
- MANUAL-001〜010

---

# 18. Phase 1完了時のテスト完了条件

Phase 1を完了するには、少なくとも以下を満たす。

- [ ] 必須Unit Testがすべて成功する
- [ ] 必須Integration Testがすべて成功する
- [ ] E2E-001〜004が成功する
- [ ] Cue分離テストが成功する
- [ ] 境界値テストが成功する
- [ ] Restart後に状態が完全初期化される
- [ ] 主要なManual Testを3人以上で実施する
- [ ] 致命的な進行停止バグがない
- [ ] 1戦60〜90秒程度で通しプレイ可能
- [ ] Phase 2へ持ち越す課題をIssue化または記録している

---

# 19. 仕様変更時の運用

ゲーム仕様の数値やルールを変更した場合、本ファイルも更新する。

例:

```text
回避受付
-0.60〜+0.10
↓
-0.70〜+0.15
```

へ変更した場合、対応する境界値テストも同時に変更する。

仕様書とテスト仕様が矛盾したまま放置しない。

---

# 20. バグ修正時

Phase 1でバグが見つかった場合、可能な限り対応するRegression Testを追加する。

例:

```text
Bug:
ふかふか布団カウンターを連打するとDamageが2回入る

Regression Test:
FUTON-010
```

テスト追加後に修正し、その後既存テストをすべて通す。

---

# 21. 備考

このテスト仕様は、ゲームの面白さそのものを保証するものではない。

自動テストの目的は、

> **「正しく動くこと」を機械に確認させ、人間は「面白いか」を確認すること**

である。

Phase 1では特に、ロジックの安全性を自動テストで確保しつつ、実際の面白さ・テンポ・予兆の読みやすさはプレイテストで調整する。
