# ソロプレイ用 NPC 設計 (Issue #158)

## 前提・スコープ

Issue #158 の本文が空だったため、意図を確認したうえで次のスコープに定めた。

- **対象**: ソロプレイ時に、プレイヤーが操作していない 2 キャラを NPC が動かす
- **切り替えは維持する**: #106 の操作キャラ切り替えはそのまま使える。切り替えた瞬間、
  それまで NPC が動かしていたキャラは人間へ、人間が離れたキャラは NPC へ、所有が入れ替わる
- **行動範囲**: 移動・攻撃・回避 + **蘇生 (REVIVE)** まで
- **ローカル限定**: マルチ (`src/multiplayer`) の空きスロットを NPC で埋めることは**やらない**

### やらないことと、その理由

| 除外項目 | 理由 |
| --- | --- |
| マルチの空きスロット NPC 化 | Authority (`battle-room.ts`) 側での tick が必須になり、権威・同期の設計が丸ごと乗る。別 Issue にする |
| 結界 (解除サークル) の NPC 対応 | 現状 `solo: true` は結界を飛ばしている (`boss-battle.ts:261`)。ここを開けるのは NPC が立ち位置を取れるようになってからで、本 Issue の後段 |

ただし後述の Policy の**シグネチャは Authority でもそのまま使える形**にしておく。
`(snapshot, context) => NpcDecision` は入力元にも React にも依存しないため、
将来 `battle-room.ts` の update ループから呼んでも成立する。今は呼ばない、というだけ。

---

## 接続点: なぜ「もう一つの入力源」なのか

このリポジトリには既に、入力元を隠す境界が引かれている。

```text
Input Source → Input Adapter → GameAction → Game Logic
```

`player-state.ts` は「入力元 (Keyboard / ARマーカー / マイク) を知らない」と明記されており
(§16 / technical-design.md §5.2)、`BossBattle.submit(playerId, action)` は
**playerId を引数で受ける**ので、誰が送ってきたかを問わない。

つまり NPC は、**キーボードやマイクと並ぶ 4 つ目の入力源**として実装できる。
`BossBattle` や `player-state.ts` には一切手を入れない。これが本設計の要点で、
既存の設計が既に用意していた穴にはめ込むだけで済む。

```text
Keyboard  ─┐
マイク     ─┼→ GameAction → BossBattle.submit(playerId, action)
ARマーカー ─┤
NPC Policy ─┘   ← 今回追加するのはここだけ
```

### `AttachInputAdapter` は使わない

既存の `AttachInputAdapter` は push 型で、**世界の状態を読む口がない**。
NPC は「ボスが今どの技の予兆に入っているか」を見て判断する必要があるため、契約が合わない。
無理に合わせると `InputAdapter` 側へ snapshot を流し込む口を開けることになり、
「入力源は世界を知らない」という既存の規律を壊す。

そこで、同じ層に**兄弟の契約**を置く。

```ts
/** NPC の意思決定。snapshot を読んで行動を決める純関数。 */
export type NpcPolicy = (snapshot: BattleSnapshot, context: NpcContext) => NpcDecision;

export interface NpcContext {
  /** このポリシーが動かすプレイヤーの roster ID。 */
  readonly selfId: string;
}
```

### 移動と離散アクションを分ける

ここは素直に `GameAction[]` を返したくなるが、**それだと動けなくなる**。

`MOVE` は押しっぱなしの状態として `Player` に残る (`player-state.ts` の
`moveInput = action.input`、`PlayerSnapshot.moveInput`)。つまり一度送った移動は
**次の `MOVE` が上書きするまで続く**。スコア最大の行動を毎フレーム 1 つだけ送る設計だと、
`ATTACK` や `REVIVE` が勝ったフレームは `MOVE` が送られず、NPC は
直前の方向へ滑り続ける。ゼロベクトルを送る機会が無いので**止まれない**——
倒れた仲間の隣で止まって蘇生する、ができない。

そこで 2 系統を明示的に分ける。

```ts
export interface NpcDecision {
  /** 毎フレーム必ず出す。止まるときも { forward: 0, right: 0 }。 */
  readonly movement: MovementInput;
  /** その瞬間に1つだけ。無ければ null。 */
  readonly action: Exclude<GameAction, { type: 'MOVE' }> | null;
}
```

移動は「毎フレーム必ず出す連続値」、その他は「その瞬間の離散イベント」。
これは `game-action.ts` が既に書いている区別
(「`MOVE` だけが連続値を持ち、他は押した瞬間の離散イベント」) と同じ切り方で、
NPC 側だけの都合ではない。

なお `moveCharacter` はベクトルを常に単位長へ正規化するので、
**方向だけを出して大きさは `CHARACTER_STATS.moveSpeed` に任せる**。
重み (aggression 等) でベクトルを伸縮させても速さは変わらないため、意味がない。

純関数にしておくと `boss-battle.test.ts` と同じ fake clock で
ヘッドレスにテストできる。「この snapshot ならこの行動が選ばれる」という
単体テストがそのまま書ける。

### 時刻は `snapshot.boss.takenAt` から取る

`NpcContext` に時刻を持たせない。`dangerZonesOfActiveAttack` が
「`takenAt` と `startedAt` は同じゲームクロック上の値」であることを前提に
経過時間を出しているので、ポリシー側が別の時計 (`performance.now()` など) を
混ぜると、fake clock のテストは通るのに実フレームではズレる、という
一番厄介な壊れ方をする。snapshot から導ける時刻はすべて `takenAt` へ揃える。

---

## 所有の決定: NPC は「人間が操作していない全員」

```ts
const npcIds = LOCAL_PLAYER_IDS.filter((id) => id !== readLocalPlayerId());
```

**毎フレーム引き直す**のが重要。`createLocalBattleSource` が送信のたびに
`readLocalPlayerId()` を読み直しているのと同じ理由で、ここで固定すると
切り替え後も NPC が人間と同じキャラを奪い合い、移動入力が毎フレーム打ち消し合う。

寝ている (`ASLEEP`) NPC は行動しない。`FALLING_ASLEEP` の NPC も自力では動けないので、
**他の NPC の蘇生対象**になるだけ。

---

## 技術的な芯: ユーティリティベースのスコアリング

ここが「気を衒う」に対する答え。素直に書くなら状態機械
(`攻撃中 / 回避中 / 蘇生中`) だが、このリポジトリの既存の規律と噛み合わない。

`CHARACTER_STATS` のコメントにある通り、この repo は
**「キャラごとの性能差がデータとして分離されている（コード分岐にしない）」** (#56) を
明示的な完了条件にしている。状態機械で NPC を書くと、
「オドルノは前に出る / Pay は下がる」を遷移条件の `if` に書くことになり、この規律を破る。

### 仕組み

毎フレーム、**候補となる離散行動を全部並べ、それぞれにスコアを付けて最大値を採る**。
移動は別系統なので、この競争には参加しない。

```text
離散行動の候補    考慮 (consideration)              スコア
─────────────────────────────────────────────────────────
ATTACK        ← ボスとの距離 / 攻撃が届くか        0.0〜1.0
DODGE         ← 予兆の残り時間 / 自分が狙われてるか
REVIVE        ← 倒れた仲間との距離 / 残り時間
                        ↓
        重み付き合計 → 最大のものを action へ (閾値未満なら null)

移動先 (movement)  ← 同じ考慮から目標地点を決めて方向ベクトルへ
                     ボスへ寄る / 危険域から退く / 倒れた仲間へ向かう
```

移動と離散行動は**同じ考慮を共有する**。「倒れた仲間が近い」は
`REVIVE` のスコアを上げると同時に、移動の目標地点をその仲間にする。
両者が別々の判断をして、殴りに行きながら逃げる、のような挙動にはならない。

そして**重みをキャラごとのテーブルにする**。`CHARACTER_STATS` と同じ形で並べる。

```ts
/** NPC の性格。docs/phase2-role-design-spec.md の役割を重みで表す。 */
export const NPC_WEIGHTS: Readonly<Record<CharacterId, NpcWeights>> = {
  /** 前線・耐久・救助担当。前に出て殴り、倒れた仲間へ真っ先に向かう。 */
  ODORUNO: { aggression: 1.0, selfPreservation: 0.6, rescue: 1.2, spacing: 0.7 },
  /** 情報・判断。距離を取り、無理をしない。移動速度を活かして逃げる。 */
  PAY: { aggression: 0.5, selfPreservation: 1.2, rescue: 0.9, spacing: 1.3 },
  /** 攻撃力が高い。隙を見て寄り、殴ったら退く。 */
  ORA: { aggression: 1.1, selfPreservation: 0.9, rescue: 0.8, spacing: 1.0 },
};
```

これで、役割設計 (`phase2-role-design-spec.md`) の
「オド＝前線 / Pay＝情報・後方 / オラ＝火力」が**数値として**表れる。
キャラ名での分岐は 1 行も書かない。プレイテストでの調整もこのテーブルだけで済む。

行動ツリーや GOAP はここでは過剰 (NPC は 3 体、行動は 5 種)。
LLM 駆動はリアルタイムのボス戦には向かない (レイテンシ・非決定性・コスト)。
LLM を使うなら Pay 大輔の「わっしょーい」台詞の**事前生成**であって、毎フレームの判断ではない。

### 実装して分かったこと: 救助のスコアを距離で下げすぎない

当初は救助を「近いほど高い」で書いていた。これは**仲間を見殺しにする**。

実測すると、15 ユニット離れて倒れている仲間に対して
救助 0.105 / 攻撃 0.333 となり、NPC は仲間を放置してボスを殴り続けた。
アリーナ半径が 24 あるのに対して距離の減衰が急すぎ、一方 `attackScore` は
射程外でも緩やかにしか下がらないため、競り負ける。

考え方が逆だった。倒れた仲間は「近いときだけ拾う用事」ではなく、
**起きている限り最優先で向かう用事**で、距離は *向かうかどうか* ではなく
*到着までどれだけかかるか* を決めるだけ。そこで距離の減衰に下限
(`DISTANT_RESCUE_FLOOR = 0.55`) を置き、アリーナの端から端でも
その値を下回らないようにした。

急ぎ (`urgency`) は上乗せに留める。`sleepCountdownMs` は 30 秒と長く、
倒れた直後は urgency がほぼ 0 になるため、これを主にすると
「倒れてしばらく放置してから向かう」挙動になる。

この種の取り違えはコードを読んでも気づきにくく、
**実際の数値を出して初めて分かった**。

### 回避が成立する根拠

`BossSnapshot.activeAttack` に `attackId` / `startedAt` / `aim` が入っており、
予兆の開始時刻と狙いが取れる。つまり NPC は
**人間と同じ情報だけを見て**予兆に反応でき、内部状態を覗く「ズル」をしない。
これは後から難易度を落とす (反応を遅らせる) 余地にもなる。

---

## 蘇生が「ズル」にならない理由

`REVIVE` は連打で進むが、`player-state.ts` が
`REVIVE_INPUT_INTERVAL_MS` で**受理間隔に上限をかけている**。
コメントにも「プログラムから叩いたりすれば一瞬で終わる」のを防ぐためと明記されている。

したがって NPC が毎フレーム `REVIVE` を送っても、人間の連打より速くはならない。
**NPC 側に throttle を足す必要はない**。既に安全。

### 何が良くなるのか

「倒れたら詰む」が解消される、ではない。`isSelectable` が見ているのは
**切り替え先**の状態なので、オドルノが倒れても Pay とオラは `ACTIVE` のまま選べる。
今でもソロで自力蘇生はできる。

改善されるのは**その手間**のほうで、現状はこうなっている。

1. 倒れたことに気づく
2. 別キャラへ切り替える
3. アリーナを横断して駆け寄る
4. `FALLING_ASLEEP` が `ASLEEP` に変わる (`sleepAt`) より前に連打しきる

これを、**誰もボスを引きつけていない状態で**やる必要がある。
NPC が入ると、この子守りが要らなくなる。そして敗北条件が
「切り替えの反射神経テスト」ではなく、本来の**3 人全員が `ASLEEP`** に戻る。

---

## 組み込み位置

`BossArenaScene.tsx` の既存の tick に 1 箇所だけ足す。

```ts
// 人間が操作していないキャラへ NPC の入力を流す。時間を進める前に
// 送るので、人間の入力と同じフレームで処理される。
if (battle !== null && npcDriver !== null) npcDriver.tick(battle);

activeSource.tick(delta);
```

`battle` はローカル戦闘のときだけ非 null (`localBattle?.battle ?? null`) なので、
この条件がそのまま「リモートでは NPC を走らせない」になる。

`npcDriver` は所有の解決 (人間が操作していない ID) と、各 NPC の Policy 呼び出し、
`battle.submit(npcId, action)` への受け渡しだけを行う薄い層にする。

---

## ファイル構成

```text
src/game/npc/
  npc-policy.ts        NpcPolicy 型 / NpcContext
  npc-weights.ts       NPC_WEIGHTS (キャラごとの性格テーブル)
  considerations.ts    距離・危険度などのスコア関数 (純関数)
  utility-policy.ts    候補を並べてスコア最大を採る既定ポリシー
  npc-driver.ts        所有解決 + submit への配線
  *.test.ts
```

`src/game/` の下に置く。React にも Three.js にも依存しない
(technical-design.md §5.1)。配線だけが `rendering/` 側に出る。

---

## 実装順

1. `npc-policy.ts` / `considerations.ts` — 型と純関数。テストだけで完結する
2. `utility-policy.ts` + `npc-weights.ts` — スコアリング本体。
   fake clock で「この snapshot ならこの行動」を単体テスト
3. `npc-driver.ts` — 所有解決。切り替え時に入れ替わることをテスト
4. `BossArenaScene.tsx` へ 1 行組み込み。実際に動かして重みを調整

1〜3 はブラウザ無しで検証できる。4 で初めて画面が要る。

---

## 検証状況

単体テスト (21 件, `src/game/npc/*.test.ts`) で確認済み。

- 操作キャラを切り替えると担当が入れ替わる (同じキャラを奪い合わない)
- 倒れた仲間へ向かい、届いたら止まって蘇生する
- `ASLEEP` の仲間へは向かわない (もう起こせないため)
- 危険範囲を踏んだら回避し、回避が使えなければ移動で抜ける
- 追尾ビームに狙われている間は回避せず走って逃げる
- 3 段目を振るかどうかがキャラの慎重さで割れる

実機 (`/world`) でも確認した。

- 操作キャラを放置したまま、NPC 2 人がボスを最終演出まで削り切る
- 倒れた操作キャラへ NPC が駆け寄り、HP 60 (最大 200 の 30%、
  `revivedHpRatio` どおり) で復帰する

### 実機確認で見つかった別のバグ

蘇生を実機で見ようとして、**操作キャラが倒れた瞬間に世界が凍る**ことが
分かった。NPC 以前の問題で、原因は 2 つ。

- `useFrame` の早期 return が `outcome !== 'ONGOING'` で、勝敗のついていない
  `LOCAL_DOWN` まで拾っていた。時間が止まるので NPC は永久に駆け寄れない
- 結果表示の Effect が `LOCAL_DOWN` を `defeat` へ丸めており、まだ負けて
  いないのに BAD END が出ていた

判定を `isBattleSettled` (`outcome-restart.ts`) へ切り出して直した。
単体テストだけでは出ず、**実機で動かして初めて分かった**類のバグ。

---

## 途中で見つかった小さなズレ

`local-player-store.ts` の冒頭コメントに「ソロではオドルノだけを生成する」とあるが、
実際は `BossArenaScene.tsx:177` が 3 人とも生成している。コメントのほうが古い。
NPC 実装時についでに直す。

---

## 後続 Issue の候補

- 結界フェーズの NPC 対応 (`solo: true` の結界スキップを外す)
- マルチの空きスロットを NPC で埋める (Authority 側 tick)
- 難易度設定 (反応遅延・スコアへのノイズ)
