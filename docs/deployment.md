# Deployment

## 0. このドキュメントの目的

フロントエンド（Vite + React SPA）を **Cloudflare Workers (Static Assets)** へデプロイし、
本番URLとPRプレビューURLを確認できるようにするための設定・確認手順をまとめる。

関連Issue: [#33](https://github.com/KOU050223/the-legend-of-nelda/issues/33)

デプロイの実行主体は **Cloudflare Workers Builds（CloudflareのGit連携）** であり、
GitHub Actions からはデプロイしない。既存の [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
は Lint / Format / Type Check / Test / Build の検証専用として変更しない。

---

## 1. 発行されるURL

`<subdomain>` はCloudflareアカウントの workers.dev サブドメイン（現在 `uozumi05`）。

| 種類               | URL の形式                                              | 更新タイミング                         |
| ------------------ | ------------------------------------------------------- | -------------------------------------- |
| 本番               | `https://nelda.<subdomain>.workers.dev`                 | `main` へマージされたとき              |
| ブランチプレビュー | `https://<branch-name>-nelda.<subdomain>.workers.dev`   | PR作成・同一ブランチへのpushのたび      |
| コミットプレビュー | `https://<version-prefix>-nelda.<subdomain>.workers.dev` | 各コミットのビルド時                   |

- ブランチプレビューURLは **同一ブランチならコミットを重ねても変わらない**。
- ブランチ名はDNSラベルの都合で英数字とハイフンへ変換される
  （例: `feat/issue-2-combat-state-machine` → `feat-issue-2-combat-state-machine`）。
- alias（ブランチ名）と `nelda` を合わせて **63文字** を超えるとブランチプレビューURLは作れない。
  その場合はコミットプレビューURLを使う。`nelda` を短くしているのはこのため。
- PRのプレビューURLはCloudflareからPRコメントへ自動投稿される。
- プレビューURLは既定で公開される。保護が必要になった場合はCloudflare Accessを別途検討する。

---

## 2. リポジトリ側の設定

| ファイル               | 内容                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `wrangler.jsonc`       | Worker名 `nelda` / `compatibility_date` / 静的アセット（`./dist`） / プレビューURL有効化 |
| `package.json`         | `wrangler` を devDependency に追加。`pnpm deploy` はローカルデプロイ用      |
| `.gitignore`           | `.wrangler/` を無視                                                        |

`wrangler.jsonc` は Worker スクリプト（`main`）を持たない **静的アセットのみの Worker** として構成する。
`assets.directory` は Vite の出力先 `./dist`、`assets.not_found_handling` は
`single-page-application`（SPAフォールバック）とする。
`vite.config.ts` の `base` / `build.outDir` は変更しない。

`pnpm build` は `tsc -b` を含むため、**型エラーがあるとデプロイも失敗する**。
CIと同じ基準で落ちる仕様として扱う。

---

## 3. Cloudflare側の設定（ダッシュボード）

以下はリポジトリ内では完結しない。Cloudflareアカウント側で
**Workers & Pages → `nelda` → Settings** から設定する。

### 3.1 Git連携

- GitHubリポジトリ `KOU050223/the-legend-of-nelda` を接続する。
- **Worker名は `nelda`** にする。
  `wrangler.jsonc` の `name` と一致しないとビルドが
  `The name in your Wrangler configuration file (<name>) must match the name of your Worker`
  で失敗する。

### 3.2 Branch control

- **Production branch**: `main`
- **Builds for non-production branches**: 有効化する
  （PRごとのプレビューURL発行とPRコメント投稿の前提）。

### 3.3 Build settings

| 項目                             | 値                                            |
| -------------------------------- | --------------------------------------------- |
| Build command                    | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command（本番）           | `npx wrangler deploy`                         |
| Non-production deploy command    | `npx wrangler versions upload`                |
| Root directory                   | （未指定。リポジトリ直下）                    |

補足:

- Workers Builds は build command の前に依存を自動installする。上の build command は
  Issueの指定どおり明示的にinstallするもので、二重installになるが動作に問題はない。
- deploy command は `package.json` の wrangler バージョンを使う。

### 3.4 Build environment variables

| 変数            | 値        | 理由                                                                 |
| --------------- | --------- | -------------------------------------------------------------------- |
| `PNPM_VERSION`  | `11.25.0` | `package.json` の `packageManager` と合わせる。build image の既定は pnpm 10.11.1 のため、明示して固定する。 |
| `NODE_VERSION`  | `24.19.0` | `package.json` の `engines` と `.node-version` に合わせる（通常は `.node-version` が読まれる。揃えておくと確実）。 |

---

## 4. ローカルでの確認

```bash
pnpm build                          # 型チェック + 本番ビルド（dist/ を生成）
pnpm exec wrangler deploy --dry-run # デプロイ内容の検証（実際にはアップロードしない）
pnpm deploy                         # ローカルから本番へデプロイ（pnpm build && wrangler deploy）
pnpm deploy:preview                 # ローカルからプレビュー版をアップロード（wrangler versions upload）
```

Cloudflareのビルドを待たずに、静的アセットとしての配信内容だけを確認したい場合は
`pnpm preview`（Vite preview）を使う。ただしSPAフォールバックなどWorkers側の
ルーティングは `pnpm exec wrangler dev` またはデプロイ後のURLで確認する。

---

## 5. デプロイが失敗したときの確認箇所

ダッシュボードの **Deployments → View build history** からビルドログを確認する。
よくある原因は以下。

| ログの手がかり                                                                 | 原因と対処                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `must match the name of your Worker`                                            | Worker名と `wrangler.jsonc` の `name` が不一致。どちらかを `nelda` に揃える。 |
| `Missing entry-point` / wrangler設定が見つからない                               | `wrangler.jsonc` が無い／Root directory がずれている。                       |
| `ERR_PNPM_IGNORED_BUILDS`                                                       | pnpm 11 で build script の可否が未指定。`pnpm-workspace.yaml` の `allowBuilds` に追記する。 |
| `Cannot install with "frozen-lockfile"` / lockfile 不一致                        | `pnpm-lock.yaml` を更新してコミットする。`PNPM_VERSION` が `packageManager` と一致しているか確認する。 |
| 型エラー（`tsc -b`）で build が落ちる                                            | `pnpm build` をローカルで通す。CIでも同じ基準で落ちる。                      |
| ビルドは成功するがURLで画面が出ない                                             | `workers_dev` / `preview_urls` が有効か、`dist/` が空でないかを確認する。    |
| プレビューURLが発行されない                                                     | 非本番ブランチビルドが無効、またはブランチ名が長すぎてaliasを作れていない。   |
| build が20分で終わらない                                                        | Workers Builds のビルド上限。依存installやbuildの時間を見直す。              |

---

## 6. 完了条件の確認方法

- 本番URL: `https://nelda.uozumi05.workers.dev` をChromeで開き、WebGLの描画まで確認する。
- プレビューURL: PR作成後、CloudflareがPRへコメントするURLを開いて確認する。
- SPAフォールバック: `https://nelda.uozumi05.workers.dev/foo` のような存在しないパスでも
  `index.html` が返り、画面が表示されることを確認する。
- ブランチプレビューURLの不変性: 同一ブランチへ追加コミットし、URLが変わらないことを確認する。
