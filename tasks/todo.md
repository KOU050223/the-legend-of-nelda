# Issue #113: オラ大輔「せざる」本番入力統合

元Issue: https://github.com/KOU050223/the-legend-of-nelda/issues/113

## 既存資産（調査済み）

- `src/input/ora/hand-detector.ts`: MediaPipe HandLandmarker、現状は右手首のみ返す
- `src/input/ora/ora-gesture-recognizer.ts`: ARマーカー座標ベース。MOVEは離散LEFT/RIGHT、ATTACKは右手振り速度、ORA_ACTIONはマーカーy座標
- `src/input/ora/ora-input-adapter.ts`: 現状Debug UI表示専用、Game Logicに未接続と明記
- `src/input/wasshoi/`: VAD (`voice-activity-detector.ts`) + `adaptive-noise-gate.ts` で発話区間/RMS/基準音量のパターンが既にある → ORA音声判定の土台に転用（ただしVAD単体を「オラ」判定に使わない。キーワード検出と組み合わせる）
- `src/input/keyboard/game-action-adapter.ts`: `AttachInputAdapter`契約を満たす本番入力の実装パターン
- `src/rendering/boss/BossArenaScene.tsx` L528-555: キーボードアダプタを`activeSource.submit()`へ繋ぐ唯一の配線点。ここをアダプタ選択構造へ組み替える
- `src/store/local-player-store.ts`: `localPlayerId === 'ora'`で選択中かどうかを判定できる
- `src/game/types/game-action.ts`: `GameAction`は`MOVE`(連続) / `ATTACK,DODGE,INTERACT,REVIVE,CHARACTER_ACTION`(離散、payload無し)。ORA_ACTIONは`CHARACTER_ACTION`にマップする
- `docs/phase2-ora-input-spec.md`: 現行はARマーカー方式の記述。本Issue実装後に更新要

## 方針（ユーザー確認済み）

- #49のARマーカーPoCコードは削除しない（fallback/experimentとして残す）
- Web Speech API (SpeechRecognition) はブラウザ内蔵エンジン利用時に音声が外部サービスへ送られる場合があるが許容する。Issueの「Raw音声をサーバーへ送らない」は自前のGame Authorityへの話と解釈
- ATTACKは 3A（オラ検出→hit/rush判定）と 3B（intensity→威力/演出反映）に分割し、3Bはvertical slice成立後に着手
- 3B着手前に、声量→ダメージ倍率が現行`GameAction`契約で運べるかを確認する（運べない場合は`GameAction` / multiplayer protocol / Authority側の変更範囲を洗い出してから実装）。完了条件からは外さない
- 本番配線は「Keyboardに Ora入力を足す」のではなく、**Ora Production Input と Keyboard Input が同じGameAction境界へ落ちるアダプタ選択構造**にする。オラ選択中の通常プレイではKeyboard/Mouseをattachしない。Debug KeyboardはDEV/fallback用途のみ残す

## フェーズ計画（ゲート分割・この順で最短距離を通す）

| # | フェーズ | 完了条件 (DoD) | 状態 |
|---|---------|----------------|------|
| 1 | 両手トラッキング基盤 + Calibration | 左右手の位置がリアルタイムで取れる、左手Neutral位置と音量基準をCalibrationで取得できる | 完了 |
| 2 | MOVE 左手Air Joystick | Dead Zone/Smoothing/Hysteresis/Clamp込みで連続MOVEが出る、Hand LostでNeutral復帰 | 完了 |
| 3A | ATTACK Voice「オラ」検出 | 「オラ」発話でATTACK発火、連続発話が複数hitへ展開、3回以上でORA RUSH、通常会話の誤発火防止（VAD単体に頼らない）、右手振りfallback維持 | 完了（純粋ロジックのみ。ブラウザ配線はPhase5） |
| 4 | ORA_ACTION 両手パー | 両手OPEN+上側+Spread+700ms HoldでCHARACTER_ACTION発火、進行度UI、Cooldown | 完了（純粋ロジックのみ。UI/配線はPhase5/6） |
| 5 | 本番配線 + Multiplayer疎通 | アダプタ選択構造でOra Production/Keyboardを切替、オラ選択中はKeyboard/Mouse非attach、Debug Keyboardのみdev fallback、Raw映像/音声非送信でGameActionのみ同期確認 | 完了（コミット未実施） |
| 6 | Debug UI拡張 (`?debug=ora`) | Camera/Mic状態、両手位置、Voice combo、ORA_ACTION進行度を表示 | 着手中（Codex並列委譲） |
| 3B | intensity → 威力/演出反映 | GameAction等の変更範囲調査 → Damage Multiplier 0.85〜1.30 clampで反映、VFX/SE/CameraShakeが音量で変化 | 未着手 |
| 7 | Docs更新 | `docs/phase2-ora-input-spec.md`をProduction方針(Markerless + Voice)へ更新、#49はfallback注記 | 未着手 |
| 8 | 品質まとめ | lint/typecheck/test/build、実機WebCam+Mic手動確認 | 未着手 |

各フェーズ完了時にClaudeが差分確認してコミット。push/PRは許可が出るまで行わない。

## レビュー

- Phase1の対象だけを実装。AR Marker PoC、UI、本番配線、MOVE/キーワード/パー判定には変更なし。
- `pnpm vitest run src/input/ora`: 6ファイル / 17テスト通過。
- `pnpm tsc -b --noEmit`: 通過。
- lint/formatはIssue #113 Phase1の指示どおり未実施。
- コミット・push・PR作成は未実施。

## Phase2 レビュー

- `src/input/ora/hand-joystick.ts` と対応テストだけを追加。UI、配線、Voice、ORA_ACTION、Phase1ファイルは変更なし。
- `pnpm vitest run src/input/ora`: 7ファイル / 26テスト通過。
- `pnpm tsc -b --noEmit`: 通過。
- `pnpm oxlint --type-aware src/input/ora`: 通過。
- コミット・push・PR作成は未実施。

## Phase3A 実装計画: ATTACK Voice「オラ」検出

### 目的と対象範囲

- `src/input/ora/voice-attack-recognizer.ts` にブラウザAPI非依存の純粋ロジックを追加する。
- `src/input/ora/voice-attack-recognizer.test.ts` をTDDで先に作成する。
- `ora-gesture-recognizer.ts`、`ora-input-adapter.ts`、UI、SpeechRecognition、Web Audio、getUserMedia、ORA_ACTIONには触れない。

### ゲート分割

- [ ] Gate 1: 入出力型、正規化・主要部分判定、音量/Cooldownの期待挙動をテストとして追加し、未実装によるREDを確認する。
- [ ] Gate 2: 最小実装でhit展開、Rush window、Clamp、resetをGREENにする。
- [ ] Gate 3: 指定テスト・型チェック・対象ディレクトリlintを実行し、差分とスコープを確認する。

### 実装手順

1. `OraUtteranceCandidate`、`OraVoiceAttackEvent`、`OraVoiceAttackRecognizerOptions`、Recognizer契約をテストから参照する。
2. `transcript` を装飾除去して「オラ」「おら」を順次カウントし、マッチ文字数と残り文字数で主要部分を判定する。
3. 音量ゲートと、直前に受理した発話の `endedAt` から候補の `startedAt` までのCooldownを適用する。
4. 受理した出現回数を `maxHitsPerUtterance` でClampし、`startedAt + index * hitSpacingMs` のhitを生成する。
5. 生成済みhitを `rushWindowMs` で期限切れ削除しながら数え、閾値到達時点のイベントだけ `isRush: true` にする。
6. `reset()` でCooldownとhit履歴を初期化する。
7. コメントは非自明な主要部分判定と状態保持の理由に限定し、日本語で記述する。

### 検証コマンド

- `pnpm vitest run src/input/ora`
- `pnpm tsc -b --noEmit`
- `pnpm oxlint --type-aware src/input/ora`

コミットは作成せず、完了時に `## レビュー` を追記する。

## Phase3A レビュー

- `src/input/ora/voice-attack-recognizer.ts` + テスト + 設計docだけを追加。UI、配線、ORA_ACTION、Phase1/2ファイルは変更なし。
- `pnpm vitest run src/input/ora`: 8ファイル / 35テスト通過。
- `pnpm tsc -b --noEmit`: 通過。
- `pnpm oxlint --type-aware src/input/ora`: 通過。
- Codexが起動した独立レビューサブエージェントが長時間応答しなかったため、Claudeが直接コード・テストを読んでレビューし、コミット（f222c0b）まで実施。
- コミット済み。push・PR作成は未実施。

## Phase4 実装計画: ORA_ACTION 両手パー

### 目的と対象範囲

- `HandObservation`へ任意の`isOpen`を追加し、MediaPipeの手首・4本指のPIP/TIPから開いた手を判定する。
- `ora-action-recognizer.ts`へ、両手Open・上側・Spread・700ms Hold・Cooldown・解除必須を持つ純粋ロジックを追加する。
- `hand-detector.test.ts`と新規`ora-action-recognizer.test.ts`をTDDで先に作成する。
- `ora-gesture-recognizer.ts`、`ora-input-adapter.ts`、`BossArenaScene.tsx`、`OraDebugPage.tsx`、`CHARACTER_ACTION`へのマッピング、Voice ATTACK配線は変更しない。

### ゲート分割

- [x] Gate 1: 開いた手/閉じた手とORA_ACTIONの必須ケースをテストに追加し、未実装によるREDを確認する。
- [x] Gate 2: `types.ts`、`hand-detector.ts`、`ora-action-recognizer.ts`を最小実装してGREENにする。
- [x] Gate 3: 指定テスト・型チェック・対象ディレクトリlintを実行し、差分とスコープを確認する。

### 実装手順

1. MediaPipeランドマークの`0`、`6/8`、`10/12`、`14/16`、`18/20`を検証するテスト用fixtureを作り、4本すべてで`distance(wrist, tip) > distance(wrist, pip) + margin`となる場合だけ`isOpen: true`にする。
2. `HandObservation.left/right`へ`isOpen?: boolean`を追加し、ランドマーク配列とMediaPipe固有の型は`hand-detector.ts`内へ閉じ込める。
3. `OraActionRecognizer`を、ポーズ解除時のHold/発動済み状態リセット、700ms到達時の1回発動、Cooldown中に到達したHoldの消費、`reset()`初期化まで含めて実装する。
4. コメントは非自明な「解除必須」と「指姿勢を距離比較にする」理由に限定し、日本語で記述する。
5. 指定3コマンドと差分確認を実行し、Phase4対象外ファイルが変更されていないことを確認する。

### 検証コマンド

- `pnpm vitest run src/input/ora`
- `pnpm tsc -b --noEmit`
- `pnpm oxlint --type-aware src/input/ora`

コミット・push・PR作成は行わない。完了後にこのファイルへ`## Phase4 レビュー`を追記する。

## Phase4 レビュー

- `src/input/ora/types.ts`で`HandObservation.left/right`へ`isOpen?: boolean`を追加し、既存の`isOpen`なしfixtureを維持した。
- `src/input/ora/hand-detector.ts`で手首と親指を除く4本のPIP/TIPを使い、距離差マージン`0.02`を超える場合に`isOpen: true`を返すようにした。MediaPipeのランドマーク配列・インデックスは同ファイル内に限定した。
- `src/input/ora/ora-action-recognizer.ts`で既定値`maxY=0.45`、`minSpread=0.35`、`holdMs=700`、`cooldownMs=1000`を実装した。ポーズ解除でHold状態をリセットし、Cooldown中に閾値到達したHoldも消費扱いにして、解除なしの再発動を防いだ。
- `src/input/ora/hand-detector.test.ts`と`src/input/ora/ora-action-recognizer.test.ts`を追加・拡張し、TDDのRED確認後にGREENを確認した。
- `pnpm vitest run src/input/ora`: 9ファイル / 48テスト通過。
- `pnpm tsc -b --noEmit`: 通過。
- `pnpm oxlint --type-aware src/input/ora`: 通過。
- `ora-gesture-recognizer.ts`、`ora-input-adapter.ts`、UI、`CHARACTER_ACTION`マッピング、Voice ATTACK配線は変更していない。
- コミット・push・PR作成は未実施。

## Phase3B 調査結果（実装はPhase5完了後に着手）

- `src/multiplayer/protocol.ts` L197-203 `isGameAction`は、離散GameAction（ATTACK等）に対し`hasOnlyKeys(value, ['type'])`のみを許可しており、`intensity`等の追加フィールドは現状拒否される。3B実装時はここも合わせて変更が必要。
- 同ファイル L205-213 `isWasshoiEvent`に`intensity: isFiniteNumber`という同型の前例パターンが既にあり、型追加時はこれを踏襲できる。
- VFX/CameraShakeの受け皿は未実装。演出反映は別途調査・実装が必要（3B着手時に改めてスコープを切る）。
- `GameAction`型自体（`src/game/types/game-action.ts`）へ`ATTACK`用のoptional `intensity`フィールドを足す方向が有力候補（`MOVE`の`input`同様、型を壊さず拡張できる）。

## Phase5・Phase6 実装計画（並列実行）

Phase4完了・コミット（a591aa1）により、Phase1〜4の純粋ロジックが揃った。Phase5（本番配線+Multiplayer疎通）とPhase6（Debug UI拡張）はファイルが重ならないため、2つのCodexエージェントへ並列委譲する。

- Phase5対象: 新規`src/input/ora/ora-production-input.ts`、`src/rendering/boss/BossArenaScene.tsx`（アダプタ選択構造への書き換え）、`src/multiplayer/`配下の疎通確認（grepのみ、変更は原則なし）
- Phase6対象: `src/ui/ora-debug/OraDebugPage.tsx`（既存ARuco PoC部分は変更せず新セクション追加）、必要なら同ディレクトリのCSS/新規ヘルパー

相互不可侵: Phase5は`OraDebugPage.tsx`に触れない。Phase6は`BossArenaScene.tsx`・`ora-production-input.ts`に触れない。両者とも`src/input/ora/`の既存純粋ロジックファイル（Phase1〜4）は変更せず呼び出すだけ。

完了後、それぞれこのファイルへ`## Phase5 レビュー`/`## Phase6 レビュー`を追記する。コミット・push・PR作成は行わない（Claudeがレビュー後にコミット）。

## Phase5 実装計画: Production Input 配線

### 設計判断

- 新規`ora-production-input.ts`にカメラ、手検出、RMS解析、SpeechRecognition、Calibration、既存純粋Recognizerの接続を閉じ込める。外へ出すのは`GameAction`、Calibration状態、ステータスだけにする。
- マイク解析は既存のWeb Audio解析セッションを再利用し、Analyserの時間波形から50ms間隔でRMSを計算する。音声候補の強度は発話区間の最大RMSを基準音量で正規化し、SpeechRecognition非対応時はVoice ATTACKだけ無効化して手入力を継続する。
- `BossArenaScene.tsx`は`isOra`の値が変わる境界だけでEffectを張り直す。Keyboardは`kind: 'keyboard'`として`pollMove()`し、Oraは検出フレームpushの`kind: 'ora'`として扱う。リモートはsnapshotの`characterId`でORAを判定し、Multiplayer protocolは変更しない。
- 初期化失敗はAdapterがステータス通知後にPromiseをrejectし、Sceneが必ずcatchする。DEVだけKeyboardへfallbackし、本番では入力をattachせずエラー表示に留める。

### ゲート分割

- [x] Gate 1: Production AdapterのCalibration前抑止、MOVE/ATTACK/CHARACTER_ACTION変換、SpeechRecognition非対応、detach解放のテストを追加し、未実装REDを確認する。
- [x] Gate 2: `ora-production-input.ts`を実装し、AdapterテストをGREENにする。
- [x] Gate 3: BossArenaSceneの`isOra`境界選択、Keyboard限定poll、DEV fallback、Calibration表示を実装し、型検査で確認する。
- [x] Gate 4: 指定テスト・型チェック・対象lint・Multiplayer経路grep・差分範囲確認を行う。

### 対象外

- `src/ui/ora-debug/`配下は変更しない。
- 既存の`src/input/ora/*recognizer.ts`、`ora-input-adapter.ts`、`GameAction`、`src/multiplayer/`の同期スキーマは変更しない。
- コミット・push・PR作成は行わない。

## Phase5 レビュー

- `src/input/ora/ora-production-input.ts`を追加し、Webcam、MediaPipe、Web Audio RMS、SpeechRecognition、Calibration、既存Recognizerを境界層へ接続した。Calibration完了まではGameActionを発火せず、状態と進捗をコールバックで公開する。
- `src/rendering/boss/BossArenaScene.tsx`をKeyboard/Oraのアダプタ選択構造へ変更した。ローカルは`ora`、リモートはsnapshotの`characterId === 'ORA'`で判定し、Keyboardの`pollMove()`はKeyboardモードだけで呼ぶ。DEVのみ初期化失敗時にKeyboardへfallbackし、本番ではエラー表示に留める。
- `src/input/ora/ora-production-input.test.ts`と`src/rendering/boss/BossArenaScene.test.tsx`を追加した。Calibration前抑止、GameAction変換、SpeechRecognition非対応、リソース解放、ローカル/リモートのORA判定を確認した。
- Multiplayer経路をgrep・確認した結果、Production Adapterから渡るのは既存の`GameAction`のみ。`remote-battle-source`→`RealtimeBattleClient`→`ACTION`→`protocol.isGameAction`の経路にMediaStream、PCM、カメラ画像を渡す箇所はなく、`src/multiplayer/`の変更は不要だった。
- 検証結果: `pnpm vitest run src/input/ora src/rendering/boss` は13ファイル/71テスト通過、`pnpm tsc -b --noEmit` 通過、`pnpm oxlint --type-aware src/input/ora src/rendering/boss` 通過。`git diff --check`も空白エラーなし。
- Phase6の`src/ui/ora-debug/`配下の並列作業ファイルは変更していない。コミット・push・PR作成は未実施。

## Phase5 実機バグ修正（PR #125 レビュー指摘）

PR #125をpushした後の実機確認で3件の不具合が判明したため修正した。

1. **Calibration UXに発声指示がない**: `BossArenaScene.tsx`のオーバーレイが「両手を自然な位置に構えてください…{進捗%}」の1文のみで、声量Calibrationのために発声が要ることを一切示していなかった。`OraCalibrationState`の`handComplete`/`voiceComplete`を個別に見て、未完了の項目だけ「両手を画面下寄りの自然な位置に構えてください」「「オラ！」と一度声に出してください」を出し分けるよう修正。
2. **「オラ！」でATTACKが発火しない**: `ora-production-input.ts`の`intensityBetween()`が、わっしょい用（シャウト前提、threshold〜RMS1.0を線形正規化）の`toIntensity`をそのまま流用し、さらにCalibration中にたまたま拾った1回の音量（baseline）で割っていた。通常会話のRMS(0.01〜0.03程度)は`baseline`次第で`voiceAttackRecognizer`の`minIntensity: 0.2`を安定して超えられず、ほとんどの発話が棄却されていた。baseline比をやめ、`normalizeOraSpeechIntensity()`（RMS 0.06を天井とする発話向けの絶対スケール）に置き換えた。Calibration用の`voiceCalibrator`（Phase3B用に温存）自体は変更していない。
3. **「オラオラ」で連続攻撃にならない**: `handleSpeechResult`が1発話から生成された複数hitを、タイムスタンプを無視して同一フレームで同期的に一括emitしていた。`attack-combo.ts`の`nextComboStep`は直前の段が`DONE`（最短500ms）になるまで次の入力を拒否するため、実質1発しか通らなかった。`scheduleAttack()`で`attackIndex * 140ms`ずつ`setTimeout`により分散発火するよう修正し、`detach()`で未発火タイマーを全解除するようにした（同一発話内の連呼が高速コンボにならないのはキーボード連打と同じ制約として許容し、`attack-combo.ts`側は変更していない）。
- 追加テスト: 通常音量がbaselineに左右されずATTACKを通す回帰テスト、複数hitの140ms間隔分散emitの確認、detach後に予約済みATTACKが発火しないことの確認。
- 検証結果: `pnpm vitest run src/input/ora src/rendering/boss` は13ファイル/74テスト通過、`pnpm tsc -b --noEmit` 通過、`pnpm oxlint --type-aware src/input/ora src/rendering/boss` 通過（Claudeが独立再実行して確認済み）。
- `src/ui/ora-debug/`配下（Phase6並列作業）には触れていない。コミットはClaudeが行う。PR #125へのpush反映はユーザー確認後。
