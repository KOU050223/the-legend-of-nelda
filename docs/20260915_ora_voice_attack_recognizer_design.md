# ORA Voice ATTACK Recognizer 設計

## 目的

ブラウザの音声認識・音声入力APIから独立して、SpeechRecognitionのfinal結果に相当する1発話をATTACK hit列へ変換する。右手振りATTACK、UI、マイク配線、ゲームアクション接続は対象外とする。

## 採用方針

- `createOraVoiceAttackRecognizer` が状態を閉じ込めたRecognizerを返す。
- 入力は `transcript`、発話区間の `startedAt` / `endedAt`、0〜1の `intensity` のみとする。
- 音量ゲート、直前に受理した発話の終了時刻を基準にしたCooldown、装飾除去後の「オラ」/「おら」の主要部分判定を順に行う。
- 受理した発話の出現回数を上限までClampし、`startedAt + index * hitSpacingMs` でhitを生成する。
- 生成済みhitの時刻だけを保持し、各hit生成時点で `rushWindowMs` 内の累積数を数えて `isRush` を決める。発話をまたぐ連打と1発話内の3hit目の両方を扱う。
- `reset()` はCooldownとRush判定に使う受理時刻・hit履歴を空に戻す。

## 正規化と主要部分判定

transcriptから空白、句読点、長音・波形記号などの装飾を除去し、残った文字列の中の「オラ」「おら」を重複しない順次走査で数える。マッチした文字数は出現回数×2とし、残り文字数がマッチ文字数を超える場合は却下する。これにより「オラ大輔こっち来て」は却下し、「オラオラオラ」は受理する。

## テスト方針

`src/input/ora/voice-attack-recognizer.test.ts` に、単発hit、1発話内Rush、通常会話却下、音量却下、Cooldown、複数発話Rush、Clamp、resetを外部挙動として固定する。テストは実装前にREDを確認する。
