# The Legend of Nelda

睡魔ボス戦をテーマにした Web ゲーム。

Phase 1 では **1人用ボス戦 PoC** を実装する。基準環境は Desktop Chrome / キーボード / 16:9。

仕様・設計は [`docs/`](./docs) を参照する。

- [`docs/single-player-poc-spec.md`](./docs/single-player-poc-spec.md) — ゲーム仕様
- [`docs/technical-design.md`](./docs/technical-design.md) — 技術方針・アーキテクチャ
- [`docs/development-workflow.md`](./docs/development-workflow.md) — 開発フロー
- [`docs/testing-strategy.md`](./docs/testing-strategy.md) — テスト方針
- [`docs/dependency-policy.md`](./docs/dependency-policy.md) — 依存バージョン方針

---

## 環境構築

### 方法 A: Nix（推奨）

Node.js と pnpm のバージョンがリポジトリで固定され、全員同じ環境になる。

```bash
nix develop      # Node.js 24.19.0 / pnpm 11.25.0 の shell へ入る
pnpm install
pnpm dev
```

[direnv](https://direnv.net/) を使う場合は、初回のみ許可すればディレクトリへ入るだけで有効になる。

```bash
direnv allow
```

Nix 自体の導入は [Determinate Nix Installer](https://determinate.systems/nix) 等を参照する。

### 方法 B: Nix を使わない場合

`.node-version` のバージョン（**24.19.0**）を nvm / fnm / mise 等で用意する。

```bash
nvm use          # または fnm use / mise install
corepack enable  # package.json の packageManager から pnpm 11.25.0 を用意する
pnpm install
pnpm dev
```

`pnpm dev` 起動後、表示された URL（既定 http://localhost:5173 ）を Chrome で開く。

---

## コマンド

| コマンド            | 内容                                              |
| ------------------- | ------------------------------------------------- |
| `pnpm dev`          | 開発サーバーを起動する                            |
| `pnpm build`        | 型チェックと本番ビルドを実行する                  |
| `pnpm preview`      | ビルド結果をローカルで確認する                    |
| `pnpm lint`         | oxlint で静的解析する（型情報を使うルールを含む） |
| `pnpm lint:fix`     | 自動修正できる指摘を修正する                      |
| `pnpm format`       | oxfmt で整形する                                  |
| `pnpm format:check` | 整形済みかを確認する                              |
| `pnpm typecheck`    | TypeScript の型チェックのみ実行する               |
| `pnpm test`         | Vitest を1回実行する                              |
| `pnpm test:watch`   | Vitest を watch モードで実行する                  |
| `pnpm deps:check`   | 依存の更新有無を確認する                          |

---

## ディレクトリ構成

[`docs/technical-design.md`](./docs/technical-design.md) §5 のレイヤー分離に対応する。

```text
src/
├─ app/          アプリのルート
├─ game/         Game Logic（Pure TypeScript / React・Three.js へ依存しない）
│  ├─ types/     PlayerAction・CombatState 等のドメイン型
│  ├─ combat/    判定ロジック
│  ├─ events/    Game Event Bus（Rendering / Audio / UI が購読する）
│  └─ clock.ts   時間の抽象化（Real / Fake）
├─ input/        DOM イベント → PlayerAction への変換
├─ rendering/    React Three Fiber による描画
├─ audio/        Audio Cue の再生（Phase 1 では未実装）
├─ ui/           React DOM の HUD / イベント UI
├─ store/        Zustand による表示状態
└─ test/         テストのセットアップ
```

### 設計上の制約

**Game Logic は Three.js / React へ依存させない。**

これは方針ではなく、lint で機械的に検証している。`src/game/**` から `three` /
`@react-three/*` / `react` を import すると `pnpm lint` が失敗する
（`.oxlintrc.json` の `no-restricted-imports`）。

判定ロジックは Pure TypeScript の関数として書き、結果を Game Event として発行する。
Rendering / Audio / UI はそれを購読する。この分離により、Phase 2 で3人プレイへ
分解する際に戦闘ルール本体を書き換えずに済むことを狙う。

---

## 技術スタック

| 分類            | 採用                                |
| --------------- | ----------------------------------- |
| Runtime         | Node.js 24 (LTS)                    |
| Package Manager | pnpm                                |
| Build           | Vite                                |
| UI              | React + TypeScript (strict)         |
| 3D              | Three.js / React Three Fiber / Drei |
| State           | Zustand                             |
| Lint / Format   | oxlint / oxfmt                      |
| Test            | Vitest + React Testing Library      |

各バージョンの選定理由と更新手順は
[`docs/dependency-policy.md`](./docs/dependency-policy.md) を参照する。

---

## 開発フロー

`main` へ直接 push せず、Issue ごとにブランチを切る。

```bash
git switch -c feat/issue-13-project-init
```

詳細は [`docs/development-workflow.md`](./docs/development-workflow.md) を参照する。
