# Testing Guide

## 0. このドキュメントの目的

**テストの書き方・動かし方**をまとめる。

「何をテストすべきか / どこまでテストするか」という方針は
[`testing-strategy.md`](./testing-strategy.md) に、Phase 1 の具体的なテストケースは
[`tests/phase1-single-player-test-spec.md`](./tests/phase1-single-player-test-spec.md)
にある。本ドキュメントは重複させず、手順だけを扱う。

---

# 1. 実行方法

```bash
pnpm test          # 1回実行する（CI と同じ）
pnpm test:watch    # 変更を監視して再実行する。実装中はこちら
```

特定のファイル・テストだけ動かす場合は以下。

```bash
pnpm test src/game/combat/judge.test.ts        # ファイルで絞り込む
pnpm test -t 'perfect window'                  # テスト名で絞り込む
pnpm test:watch src/game/combat/judge.test.ts  # 絞り込んで watch する
```

引数は `--` を挟まずそのまま渡す。`pnpm test -- -t '...'` と書くと
フィルタが効かず全件実行されるため注意する。

---

# 2. テストの置き場所

**テスト対象と同じディレクトリに `*.test.ts` / `*.test.tsx` を置く。**
`__tests__/` のような別ツリーは作らない。

```text
src/game/combat/
├─ judge.ts
└─ judge.test.ts      ← 同じ場所

src/input/keyboard/
├─ keyboard-adapter.ts
└─ keyboard-adapter.test.ts
```

`vite.config.ts` の `test.include` が `src/**/*.{test,spec}.{ts,tsx}` を拾うため、
この命名なら設定を触らずに認識される。

---

# 3. 実行環境

`vite.config.ts` の `test` ブロックで以下が設定済み。

| 設定           | 値                     | 意味                                                        |
| -------------- | ---------------------- | ----------------------------------------------------------- |
| `environment`  | `jsdom`                | `window` / `document` が使える。DOM を触るテストのため       |
| `globals`      | `true`                 | `describe` / `it` / `expect` を import なしでも使える        |
| `setupFiles`   | `src/test/setup.ts`    | 全テストの前に読まれる                                       |

`src/test/setup.ts` は `@testing-library/jest-dom/vitest` を読み込み、
`toBeInTheDocument()` などの DOM 向け matcher を有効にしている。

import は `@/` エイリアスでも相対パスでも書ける。
同じレイヤー内は相対、レイヤーをまたぐ場合は `@/` を推奨する。

```ts
import { judgePlayerAction } from './judge';        // 同一ディレクトリ
import type { PlayerAction } from '@/game/types';   // 別レイヤー
```

なお `globals: true` だが、既存テストは `import { describe, expect, it } from 'vitest'`
を明示している。どちらが正解か迷わせないため、**明示 import に揃える。**

---

# 4. Game Logic のテスト（基本形）

`src/game/**` は Pure TypeScript で、React / Three.js に依存しない
（この制約は `.oxlintrc.json` の `no-restricted-imports` で lint が機械的に検証している）。
そのため **Three.js も R3F も起動せずに関数として直接呼べる。**

`src/game/combat/judge.test.ts` が最小の見本になる。

```ts
import { describe, expect, it } from 'vitest';

import { judgePlayerAction, type AttackTiming } from './judge';

const dodgeAttack: AttackTiming = {
  correctAction: 'DODGE_LEFT',
  hitAt: 1000,
  acceptFromMs: -600,
  acceptToMs: 100,
  perfectFromMs: -100,
  perfectToMs: 100,
};

describe('judgePlayerAction', () => {
  it('正解入力がperfect window内ならPERFECT_DODGEになる', () => {
    expect(judgePlayerAction({ attack: dodgeAttack, action: 'DODGE_LEFT', inputAt: 1050 })).toBe(
      'PERFECT_DODGE',
    );
  });
});
```

テスト名は日本語で「**何をしたら、どうなるべきか**」が読み取れる形にする
（[`testing-strategy.md`](./testing-strategy.md) §16）。

---

# 5. 時間に依存するテスト

**実時間を待たない。** `setTimeout` や `await sleep(600)` をテストへ書かない。
実行が遅くなり、CI で Flaky になる。

時間を読む処理は `src/game/clock.ts` の `GameClock` を受け取る形にし、
テストでは `createFakeClock()` を渡して任意の時刻へ進める。

```ts
import { createFakeClock } from '@/game/clock';

const clock = createFakeClock();   // now() === 0
clock.advance(600);                // now() === 600 へ即座に進む
```

`performance.now()` を実装から直接呼ぶと差し替えられなくなるため、
`GameClock` を引数か生成時に注入する。

判定ロジックのように「時刻そのものを引数で受け取れる」設計なら、
clock を使わず `inputAt: 1050` のように値を直接渡す方が単純でよい。

---

# 6. 境界値を必ず書く

入力受付・HP・SLEEPINESS のような**幅を持つ仕様は、両端とその外側**をテストする。
受付幅が `-600ms 〜 +100ms` なら、少なくとも次を書く。

| 入力時刻 | 期待   |
| -------: | ------ |
|     -601 | 受付外 |
|     -600 | 受付   |
|        0 | 受付   |
|     +100 | 受付   |
|     +101 | 受付外 |

中央値だけのテストは、境界をずらすリグレッションを検知できない。

---

# 7. ランダムを含む処理

`Math.random()` を実装から直接呼ばない。乱数源を注入し、テストでは固定値を返す。

```ts
const fixedRandom = () => 0.42;
```

「たまたま右攻撃が出たから成功した」テストは書かない
（[`testing-strategy.md`](./testing-strategy.md) §6）。

---

# 8. UI のテスト

React Testing Library を使う。対象は**状態に応じた表示の切り替え**に絞り、
レイアウトやフォントサイズなど見た目の細部は Manual Test で確認する
（[`testing-strategy.md`](./testing-strategy.md) §11）。

`src/ui/hud/Hud.test.tsx` が見本になる。Zustand store を使うコンポーネントは、
`useGameStore.setState()` で状態を作ってから `render` する。

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_BOSS_HP, useGameStore } from '@/store/game-store';

import { Hud } from './Hud';

describe('Hud', () => {
  // store はテスト間で共有されるため、毎回初期化する。
  // setState は merge のため、このテストが読む項目を明示的に戻す。
  // 参照する項目を増やしたら、ここへも追加する。
  beforeEach(() => {
    useGameStore.setState({ bossHp: INITIAL_BOSS_HP, sleepiness: 0, lastAction: null });
  });

  it('storeのSLEEPINESSを表示する', () => {
    useGameStore.setState({ sleepiness: 42 });

    render(<Hud />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
```

store をリセットしないと、先に実行されたテストの状態が残って
実行順に依存する Flaky Test になる。

Three.js の Canvas を描画するコンポーネントは jsdom で動かない。
`src/rendering/**` を自動テストの対象にせず、テストしたいロジックは
`src/game/**` 側へ切り出す。

---

# 9. DOM イベントのテスト

Input Adapter のように `window` のイベントを購読する処理は、
jsdom 上でイベントを発火して確認する。**購読解除まで検証する。**

`src/input/keyboard/keyboard-adapter.test.ts` が見本になる。

```ts
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
```

登録したリスナーはテスト内で必ず解除する。残ると後続のテストへ影響し、
実行順に依存する Flaky Test の原因になる。

---

# 10. バグを直すとき

1. バグを再現するテストを書く
2. **失敗することを確認する**
3. 直す
4. 通ることを確認する

手順 2 を飛ばすと、テストが本当にそのバグを捕まえているか分からない。

---

# 11. CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) が Pull Request と
`main` への push で走り、以下を順に実行する。

```text
install → lint → format:check → typecheck → test → build
```

いずれかが失敗すると PR 上で CI が赤くなり、失敗した step 名
（`Unit test` / `Type check` など）から原因の種類が分かる。
ログはその step を開いて確認する。

push 前にローカルで同じ順に流せば、CI の失敗はほぼ避けられる。

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

---

# 12. Definition of Done

ロジックを変更する Issue / PR は、実装と同じ PR でテストまで終わらせる。
チェック項目は [`testing-strategy.md`](./testing-strategy.md) §18 / §19 と
[`development-workflow.md`](./development-workflow.md) §8 を参照する。
