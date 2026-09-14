# Dependency Policy

## 0. このドキュメントの目的

採用ライブラリのバージョン方針と、「古くなっていないか」を確認する手順を定義する。

意図的に latest を採用していない箇所を記録し、更新漏れと区別できるようにする。

---

# 1. 原則

- 原則として各パッケージの **latest** を採用する。
- latest を採用しない場合は、**必ず本ドキュメントへ理由を残す**。
- peer dependency の警告を残したままにしない。
- lockfile は `pnpm-lock.yaml` のみをコミットする。

---

# 2. 確認コマンド

```bash
pnpm deps:check   # = pnpm outdated
pnpm install      # peer dependency 警告が出ないこと
```

`pnpm outdated` の出力が「§3 の意図的固定」だけになっている状態を正とする。

Nix 側（Node.js / pnpm）の確認:

```bash
nix flake update   # nixpkgs を更新
nix develop -c node --version
nix develop -c pnpm --version
```

---

# 3. 意図的に latest を採用していないもの

最終確認日: 2026-09-13

| パッケージ | 採用 | latest | 理由 |
| --- | --- | --- | --- |
| `react` | 19.2.8 | 19.3.0 | `@react-three/fiber@9.7.0` の peer が `react: >=19 <19.3` のため。R3F が 19.3 へ対応したら追従する。 |
| `react-dom` | 19.2.8 | 19.3.0 | 同上（`react` とバージョンを揃える）。 |
| `@types/react` | 19.2.18 | 19.3.0 | `react` のバージョンへ合わせる。 |
| `@types/react-dom` | 19.2.7 | 19.3.0 | `react-dom` のバージョンへ合わせる。 |
| `@types/node` | 24.13.4 | 26.5.1 | Node.js 24系を採用しているため、対応する型定義の24系へ合わせる。Node.js本体を26系へ更新するまで据え置く。 |
| `pnpm` | 11.25.0 | 12.4.1 | Nix を環境の source of truth とするため、nixpkgs が提供する版へ `packageManager` を合わせている。nixpkgs 側が上がったら追従する。 |

`react` は `^19.2.8` と書くと semver 上 19.3.0 を許容してしまうため、
`package.json` では**完全固定**で記述している。

---

# 4. Node.js

Node.js は LTS 系（現行: v24 Krypton）を採用する。

バージョンは以下の2箇所で固定し、**両者を一致させる**。

| ファイル | 役割 |
| --- | --- |
| `flake.nix` (`nodejs_24`) | Nix 利用者の実効バージョン |
| `.node-version` | nvm / fnm / mise 等の利用者向け |

現在: **24.19.0**

`flake.lock` を更新して Node のパッチバージョンが変わった場合は、
`.node-version` も同時に更新する。

---

# 5. Lint / Format ツール

ESLint / Prettier ではなく **oxlint / oxfmt**（Rust 実装の oxc プロジェクト）を採用する。

| ツール | バージョン | 備考 |
| --- | --- | --- |
| `oxlint` | 1.82.0 | `--type-aware` で型情報を使うルールも有効化 |
| `oxlint-tsgolint` | 7.0.2001 | `--type-aware` の実行に必要 |
| `oxfmt` | 0.67.0 | Prettier 互換オプションで設定 |

`oxfmt` は現時点で **0.x**（1.0 未満）であり、整形結果が将来変わる可能性がある。
フォーマット差分が大きく出た場合は、本ドキュメントの版を確認する。

`oxlint` は typescript-eslint に依存しないため、
TypeScript のバージョン上限制約を受けない（TypeScript 7 系をそのまま採用できている）。

---

# 6. 更新時の手順

1. `pnpm deps:check` で差分を確認する
2. 更新するパッケージの peer dependency を確認する
   ```bash
   npm view <pkg> peerDependencies
   ```
3. `pnpm update <pkg>` または `package.json` を直接編集する
4. `pnpm install` で peer 警告が出ないことを確認する
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` を通す
6. 意図的に latest を見送った場合は §3 の表を更新する
