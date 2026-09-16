# イントロ音声読み上げ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目的:** Issue #136 の13本のイントロ音声を、既存の13ショットへ番号順に同期して再生する。

**アーキテクチャ:** 既存の映像タイムラインは変更責務を増やさず、イントロ専用の音声プレイヤーを追加する。通常のショット遷移は音声要素の `ended` イベントを唯一の完了通知として使い、再生拒否時だけ既存のショット尺をフォールバックにする。音声ファイルは既存の `public/audio/se/intro_voice/` にあるMP3をそのまま参照する。

**技術:** React、TypeScript、HTMLAudioElement、Vitest、既存のイントロショット定義。

---

### タスク1: イントロ音声プレイヤーの契約とテスト

**対象ファイル:**
- 作成: `src/intro/intro-voice.test.ts`
- 作成: `src/intro/intro-voice.ts`

- [ ] **Step 1: 失敗するテストを書く**
  - `createIntroVoicePlayer({ createAudio })` が13個の `/audio/se/intro_voice/intro_voiceN.mp3` を `preload='auto'` で生成することを検証する。
  - `play(index)` が対象音声を先頭へ戻して再生し、別の index へ移ると前の音声を停止することを検証する。
  - 同じ index の再通知では二重再生せず、範囲外 index は何もしないことを検証する。
  - `stop()`/`dispose()` が再生中の要素を停止し、`src=''` へ解放することを検証する。
  - `play()` が同期例外または reject Promise を返しても例外を外へ投げないことを検証する。
  - `ended` と再生拒否をショット番号付きで通知することを検証する。
- [ ] **Step 2: テストを実行してREDを確認する**
  - 実行: `pnpm test src/intro/intro-voice.test.ts`
  - 期待: `intro-voice.ts` が存在しないため失敗する。
- [ ] **Step 3: 最小実装を書く**
  - `IntroVoicePlayer` は `play(index)`, `stop()`, `dispose()` を公開する。
  - 生成時に全音声を事前生成し、再生時は `pause()`、`currentTime=0`、`play()` の順に実行する。
  - `play()` の Promise rejection と同期例外は握り潰し、イントロの進行を止めない。
- [ ] **Step 4: テストを実行してGREENを確認する**
  - 実行: `pnpm test src/intro/intro-voice.test.ts`
  - 期待: 追加した全テストが通過する。

### タスク2: 音声完了イベントと映像ショットの接続

**対象ファイル:**
- 変更: `src/intro/cutscene-timeline.ts`
- 変更: `src/intro/cutscene-timeline.test.ts`
- 変更: `src/intro/IntroCutscene.tsx`

- [ ] **Step 1: 音声完了イベントから次ショットへ進む接続を実装する**
  - `IntroCutscene` は現在のショット番号だけをstateで保持し、`createIntroVoicePlayer({ onEnded })` の通知で次へ進める。
  - 通知元の番号が現在のショットと一致する場合だけ進め、古い音声の遅延イベントでショットを飛ばさない。
- [ ] **Step 2: 再生拒否時のフォールバックを実装する**
  - `onPlayError` 通知時は該当ショットの `durationMs` 後に次へ進める。
  - コンポーネントのcleanupでフォールバックタイマーを解除し、終了・SKIP後に状態更新しない。
- [ ] **Step 3: `IntroCutscene` のライフサイクルを検証する**
  - 初回ショットは `useLayoutEffect` でユーザー操作直後に再生を試みる。
  - `finish()` とアンマウント時に音声を停止・破棄し、React StrictMode の再マウントでも音声が残らない。
- [ ] **Step 4: イントロ関連テストを実行する**
  - 実行: `pnpm test src/intro`
  - 期待: 既存テストと追加テストがすべて通過する。

### タスク3: 品質確認とPR作成

**対象:** 変更差分、既存の音声ファイル、Issue #136

- [ ] **Step 1: フォーマット・型・lint・テスト・buildを実行する**
  - 実行: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`
  - 期待: すべて終了コード0。
- [ ] **Step 2: 差分と音声ファイルの対応を確認する**
  - `git diff --check` を実行する。
  - `git status --short` で意図したファイルだけが変更されていることを確認する。
  - `public/audio/se/intro_voice/intro_voice1.mp3`〜`intro_voice13.mp3` が存在することを確認する。
- [ ] **Step 3: コミットしてpushする**
  - 実行: `git add src/intro docs/20260916_intro_voice_implementation_plan.md tasks/todo.md`
  - 実行: `git commit -m "feat: add intro narration voices"`
  - 実行: `git push -u origin HEAD`
- [ ] **Step 4: PR前の独立レビューを行う**
  - `architect-review` スキルでステージ済み差分をレビューし、指摘があれば修正して再検証する。
- [ ] **Step 5: GitHub Issue #136 に紐づくPRを作成する**
  - `gh pr create --title "feat: add intro narration voices" --body "Closes #136\n\n13本のイントロ音声を既存ショットへ番号順に同期再生します。"`
