# Issue #140: 意図的に残している既知バグを `*.bug.test.ts` へ分離する

元Issue: https://github.com/KOU050223/the-legend-of-nelda/issues/140

## ゴール

`*.bug.test.ts` / `*.bug.test.tsx` を読むだけで「このプロダクトに現在どんな
意図的に残しているバグがあるか」が分かる状態にする。単なるリネームではなく
**実行可能なバグ仕様書**にすることが目的。

最重要制約: **バグを推測で分類しない**。Issue / PR / docs / コードコメント /
Git履歴などの明示的な根拠で「既知・意図的」と確認できたものだけを移す。
曖昧なものは通常テストのまま残す。

## 調査（3エージェント並列、独立実施）

| 担当 | 範囲 | 状態 |
|------|------|------|
| Claude A | `src/**/*.test.*`, `server/**/*.test.ts` 全111ファイル + 本番コードのコメント | 完了 |
| Claude B | `docs/`, `tasks/`, `AGENTS.md`, `CLAUDE.md`, `.github/` | 完了 |
| Claude C | GitHub Issue / PR / Git履歴 | 実行中 |
| 本体 | 上記の突き合わせ・再検証・実装 | 進行中 |

## ベースライン（分離前）

| 項目 | 値 |
|------|-----|
| client テスト (`pnpm test`) | 303 suite / **1135 件** 全パス |
| server テスト (`pnpm test:server`) | **14 件** 全パス |
| 合計 | **1149 件** |
| `pnpm typecheck` | パス |
| `pnpm lint` | パス |
| `pnpm format:check` | **ベースラインで失敗**（後述、本Issueとは無関係） |

テスト件数の増減検証は `fullName` の多重集合比較スクリプトで行う。

## テストランナーの確認（完了・設定変更不要）

`vite.config.ts` の `include: ['src/**/*.{test,spec}.{ts,tsx}']` と
`vitest.server.config.ts` の `include: ['server/**/*.test.ts']` は、
`*` が `foo.bug` を吸収するため `foo.bug.test.ts` を**そのまま拾う**。

実証: 一時ファイル `src/__probe140.bug.test.ts` / `server/__probe140.bug.test.ts`
を置いて `vitest list` と `vitest run` で収集・実行されることを確認し、削除済み。
CI (`pnpm test:coverage` / `pnpm test:server`) と lefthook の
`vitest related` も同じ include を通るため、**設定変更は不要**。

## 既知の環境問題（本Issueのスコープ外）

`pnpm format:check` はベースラインで失敗する。原因は2つで、どちらも本Issueの
変更とは無関係:

1. `core.autocrlf=true` の Windows チェックアウトで作業ファイルが CRLF になり、
   `.oxfmtrc.json` の `"endOfLine": "lf"` と食い違う。
2. `CLAUDE.md` は git 上 symlink (mode 120000) だが Windows では中身
   `AGENTS.md` の平文ファイルとして展開され、oxfmt が markdown として整形対象にする。

→ **`pnpm format`（引数なし）は実行しない**。`CLAUDE.md` の symlink を壊すため。
整形が要る場合は変更したファイルのみを対象にする。

## 進め方（ゲート分割）

- [x] G1. ベースライン取得（テスト件数・typecheck・lint）
- [x] G2. `*.bug.test.ts` がテストランナーに拾われることを実証
- [x] G3. 3エージェントによる独立調査
- [ ] G4. 3者の根拠を突き合わせ、**一致したものだけ**を候補として確定
- [ ] G5. ユーザーと分類方針をすり合わせ（曖昧候補の扱い）
- [ ] G6. 実装（テスト分離）
- [ ] G7. Testing Guide への追記
- [ ] G8. 品質確認（test / typecheck / lint / git diff / テスト件数の保全）

## レビュー

（完了後に追記する）
