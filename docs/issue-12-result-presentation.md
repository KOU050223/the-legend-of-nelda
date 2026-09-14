# Issue #12: 決着演出と再戦

勝敗は既存の State Machine が決定する。`COMBAT_STATE_CHANGED` の
`BOSS_DEFEATED` / `PLAYER_LOSE` を Result Presentation Adapter が1戦に1回だけ受け取り、
表示状態へ変換する。HPを削り切る経路と最終布団FINISHは同じ勝利演出へ入る。

## 演出

- 勝利: 白金のフラッシュ、200ms停止、1100msでボスが跳ね上がって2回転し後方へ倒れる。カメラを寄せ、短いシェイクを加える。
- 敗北: プレイヤーが1400msで横倒しになり、青紫の暗転と引きのカメラで寝落ちを表す。
- 決着1800ms後に巨大なタイトル、2500ms後に副題、3200ms後にRestartを表示する。
- 金色のセリフ体、黒帯、過剰に真剣な日本語と二度寝の題材の落差でB級感を出す。音源・外部素材の追加はない。
- Result中は通常HUDを非表示にし、戦闘用キー購読を解除する。TabでRestartへ移動しSpace/Enterで再戦できる。

演出時間はセッション所有の `GameClock` と既存のフレームループで駆動する。
Result専用のsetTimeoutや追加ループは作らない。CSSアニメーションと3Dモデルは戦闘単位のReact subtreeに属する。

## 再戦と破棄

Restartで戦闘のkeyを更新し、旧セッション・キー購読・store購読・HUD購読・Result購読を破棄する。
新しいセッションはVitals、State Machine、Input Lock、Counter Windowを新規生成し、
シーケンスと表示storeを初期化する。3Dシーンも再マウントし、位置・回転・カメラを戻す。
`dispose` は複数回呼んでも安全で、破棄済みセッションへの入力も無効。

## 自動テストの対応

| ID | 確認箇所 |
| --- | --- |
| RESULT-001 | App.test.tsx: 枕への反撃を繰り返しHP0から勝利画面へ到達 |
| RESULT-002 | combat-session.test.ts: 最終布団FINISHからvictoryへ接続 |
| RESULT-003 | App.test.tsx: 無入力で眠気100から敗北画面へ到達 |
| RESULT-004/005 | ResultOverlay.test.tsx: 重複通知で演出を巻き戻さない、破棄後は通知無効 |
| RESULT-006/007 | App.test.tsx: 決着後の入力と時間経過で戦闘を再開しない |
| RESULT-008 | App.test.tsx: 勝利・敗北からの再戦、StrictModeで3回連続再戦、旧イベント購読の解除、ループ数と入力回数の維持 |

表示の段階的な切り替えはFake Clock、実セッションを使うReact統合テストはFake Timerで確認する。

## 画面確認（2026-09-14）

Codex内蔵ブラウザ、1280×720で以下を確認した。

- 一時的な自動入力で既存の攻撃・判定・最終布団FINISHを通過し、勝利画面へ到達。
- 無入力で眠気100に達し、横倒しのプレイヤー・暗転・敗北文言を確認。
- 勝利後のクリック再戦、敗北後のTab＋Space再戦でゲージとHUDが初期状態へ戻る。
- 勝利・敗北の文字とRestartに重なり・はみ出しがない。
- 撮影用の自動入力コードは撮影後に削除。画像は `docs/previews/issue-12-victory.png` と `issue-12-defeat.png`。

連続3回の再戦と重複検知は自動テストで確認。Desktop Chromeでの人手による通しプレイ、
動きの気持ちよさとB級感の評価はレビュー時にも確認してほしい。

検証環境のNodeは22.22.2のため、package.jsonの指定（24.19.0以上）に対してengine警告が出る。
ビルドではThree.jsを含むチャンクサイズの警告が残る。
