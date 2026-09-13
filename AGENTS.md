# AGENTS.md

仕様・採用技術に関しては `docs/`を参照する

## PR作成時のフロントエンド画面変更

フロントエンドの画面に変更がある場合は、変更対象画面のスクリーンショットを撮影し、`gh` コマンド経由でPR本文に貼り付ける。

スクリーンショットは `docs/previews/` へ置いてコミットし、PR本文からは raw URL で参照する。GitHubのPR本文は画像をURLでしか埋め込めないため、リポジトリに置いた画像を参照先にする。

ファイル名は `issue-<番号>-<画面の内容>.png` とする（例: `issue-10-tutorial-pillow.png`）。どのIssueのどの画面かがファイル名だけで分かるようにする。

raw URL は次の形式で、`<sha>` には画像をコミットしたコミットのSHAを入れる。ブランチ名ではなくSHAを使う。ブランチ名で参照すると、後からそのブランチが進んだときにPR本文の画像が別物に差し替わる。

```text
https://raw.githubusercontent.com/<owner>/<repo>/<sha>/docs/previews/<file>.png
```

撮影のために一時的なデバッグコード（storeの露出など）を入れた場合は、撮影後に必ず元へ戻し、`git status` で差分が残っていないことを確認する。
