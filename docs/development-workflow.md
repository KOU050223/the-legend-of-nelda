# Development Workflow

## 0. このドキュメントの目的

本ドキュメントは、The Legend of Nelda の実装を開始するために必要な**最低限の開発環境・ツール運用・GitHub運用ルール**を定義する。

ゲーム仕様・アーキテクチャ・テスト方針は以下を参照する。

- [`single-player-poc-spec.md`](./single-player-poc-spec.md)
- [`technical-design.md`](./technical-design.md)
- [`testing-strategy.md`](./testing-strategy.md)
- [`testing-guide.md`](./testing-guide.md)
- [`tests/phase1-single-player-test-spec.md`](./tests/phase1-single-player-test-spec.md)

このドキュメントではルールを増やしすぎず、ハッカソン開発を止めないために必要な事項だけを決める。

---

# 1. Phase 1 の対象環境

Phase 1 の1人用ボス戦PoCは、まず以下を基準環境とする。

- **Desktop Web**
- **Google Chrome系ブラウザを基準**
- **キーボード操作**
- **16:9を基準レイアウト**
- 1280x720以上を主な確認対象とする

Phase 1では、以下への完全対応は必須としない。

- スマートフォン
- タブレット
- Safari / Firefox固有対応
- タッチ操作
- ゲームパッド

ただし、Phase 2で複数端末参加へ拡張するため、特定解像度への完全固定やDesktop固有APIへの強い依存は避ける。

---

# 2. 入力方針

Phase 1では4つのゲームActionをキーボードへ割り当てる。

```text
DODGE_LEFT
DODGE_RIGHT
GUARD
ATTACK
```

具体的なキーは #13 実装時に確定してよいが、DOMの `KeyboardEvent` をGame Logicへ直接渡さない。

```text
KeyboardEvent
↓
Input Adapter
↓
PlayerAction
↓
Game Logic
```

キー割り当てを変更しても戦闘ロジックやテストを書き直さなくてよい構造にする。

---

# 3. Phase 1 のツールチェーン

Phase 1では以下を標準構成とする。

```text
Runtime
└─ Node.js LTS

Package Manager
└─ pnpm

Application
├─ Vite
├─ React
├─ TypeScript
├─ Three.js
├─ React Three Fiber
├─ Drei
└─ Zustand

Quality
├─ ESLint
├─ Prettier
└─ TypeScript strict mode

Test
├─ Vitest
├─ React Testing Library
└─ Playwright（必要になった時点で追加）

CI
└─ GitHub Actions
```

Node.jsの具体バージョンは、#13でプロジェクトを初期化する時点のLTSを採用し、`.nvmrc`、`.node-version`、`mise.toml` 等のいずれかでリポジトリ内に固定する。

パッケージマネージャは `pnpm` に統一し、複数種類のlockfileをコミットしない。

---

# 4. 標準コマンド

#13完了時点で、少なくとも以下に相当するコマンドを用意する。

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

必要になった段階で以下を追加する。

```bash
pnpm test:watch
pnpm test:coverage
pnpm test:e2e
```

READMEから、初参加メンバーが起動方法とテスト方法を確認できるようにする。

---

# 5. Git / GitHub 開発フロー

基本フローは以下とする。

```text
Issueを選ぶ
↓
Branchを作成
↓
実装 + テスト
↓
Pull Request
↓
CI
↓
Review / 動作確認
↓
mainへMerge
```

原則として、機能実装を直接 `main` へpushしない。

ハッカソン期間中に運用が重くなった場合は簡略化してよいが、**IssueとPRの対応関係、CI、テスト**はできるだけ維持する。

---

# 6. Branch命名

Issue番号が分かる形を推奨する。

例:

```text
feat/issue-2-combat-state-machine
feat/issue-6-pillow-sweep
fix/issue-21-counter-window
chore/issue-15-ci
```

厳密な命名規則より、どのIssueの作業か分かることを優先する。

---

# 7. Pull Request方針

1つのPRは原則として1つのIssueを中心にする。

PR本文には最低限以下を書く。

```text
## What
何を実装したか

## Test
どう確認したか

## Related Issue
Closes #N
```

ロジックを変更した場合は、対応する自動テストの追加・更新を原則必須とする。

UI / VFX / SEのように自動テストが適さない場合は、Manual Testの確認内容を書く。

---

# 8. Merge条件

原則として以下を満たしてからMergeする。

- [ ] Buildが成功する
- [ ] Type Checkが成功する
- [ ] Lintが成功する
- [ ] 必須テストが成功する
- [ ] Issueの完了条件を満たす
- [ ] 必要なManual Testを実施した
- [ ] 仕様変更があればdocsを更新した

テスト失敗を無視してMergeする場合は、理由と後続Issueを残す。

---

# 9. Graybox First

3D Assetや演出の完成を待ってゲームロジック実装を止めない。

Phase 1前半では、

- Box / Sphere / Capsule等のPrimitive
- 仮Boss
- 仮Player
- 仮枕 / 仮布団
- 仮SE
- 仮VFX

で構わない。

優先順位は以下とする。

```text
戦闘ロジックが成立
↓
テスト可能
↓
通しプレイ可能
↓
演出・Asset強化
```

3D Asset方針の詳細は [`technical-design.md`](./technical-design.md) を参照する。

---

# 10. Phase 1開始時に決めなくてよいもの

以下は必要になったPhaseで決定する。

- 3人リアルタイム通信方式
- WebSocket / WebRTCの詳細
- MediaPipe
- カメラ / マイク利用方式
- Role別Audio routing
- DeviceMotion
- IoT / ESP32
- 観客用Client構成
- 本番Hosting先

Phase 1では、将来差し替えや追加ができる責務分離だけ維持する。

---

# 11. #13 完了時のチェック

Issue #13「ゲームプロジェクトを初期化し開発基盤を整える」は、最低限以下を満たせば完了とする。

- [ ] Node.jsバージョンを固定している
- [ ] pnpmで依存関係をinstallできる
- [ ] `pnpm dev` で起動できる
- [ ] React + R3Fで最小3D Sceneを表示できる
- [ ] `pnpm build` が成功する
- [ ] `pnpm lint` が成功する
- [ ] `pnpm typecheck` が成功する
- [ ] `pnpm test` が実行できる
- [ ] TypeScript strict modeが有効
- [ ] Game LogicとRenderingの初期ディレクトリが分離されている
- [ ] READMEに環境構築・起動方法がある

CIについては専用Issueで整備し、戦闘ロジックの本格実装へ入る前にPR時の自動チェックを有効化する。

---

# 12. 方針

このプロジェクトでは、開発ルールを厳格にすること自体を目的としない。

> **バグ調査と手戻りを減らしつつ、チームが高速にゲームを作れる最低限の仕組みを維持する。**

仕様・テスト・CI・Issueを安全網として利用し、ハッカソン期間中の実装速度を上げることを優先する。
