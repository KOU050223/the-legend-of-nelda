# Phase 2 音声チャネルとRole別配信の決定

Issue #60 の決定記録。これは #47（3人協力の同期設計）と #50（Pay大輔のWasshoi PoC）が従う実装契約である。

## 決定

Phase 2 のプレイヤー間会話は、**ゲーム内の音声チャネルだけを正式な会話経路**とする。

- オドルノDaisukeとオラ大輔の通常発話は、ゲームが確立した WebRTC の音声トラックで相手2人へ送る。
- Pay大輔のマイク音声は、ローカルの `AudioWorklet` / `WasshoiEngine` までで処理し、WebRTC の音声トラック、録音、サーバーログのいずれにも載せない。
- Pay Client は発話特徴だけから `WasshoiEvent` を作り、リアルタイムゲームセッションへ送信する。セッションは他の2人へそのイベントだけを転送し、各受信Clientが録音済みのWasshoi Sampleを再生する。
- Discord等の外部通話は正式なゲーム経路に含めず、MVPのプレイ・デモでは使用しない。ブラウザ外の会話を技術的に遮断することはできないため、同一空間での肉声会話も含めてゲーム外の伝達は検証対象外とする。

3人の少人数セッションでは、WebRTCをメディア経路に使う。接続確立のシグナリング、ゲーム状態同期、再接続、および `WasshoiEvent` の配送保証は #47 で決定・実装する。`WasshoiEvent` は音声トラックへ混ぜず、ゲームイベントとして扱う。

```text
オドルノ / オラ
Microphone → WebRTC audio track → 他2 Client

Pay
Microphone → AudioWorklet → WasshoiEngine → WasshoiEvent
                                            ↓
                                   Realtime Game Session
                                            ↓
                                他2 ClientでWasshoiを再生
```

## Role別配信の責務

Role別の情報制御は、**Realtime Game Session を権威（authoritative）とするサーバー側**に置く。

1. サーバーは接続時に各ClientのRoleを確定し、ゲーム状態を保持する。
2. Game LogicがCueを生成すると、サーバー上の `Role-based Cue Router` が宛先Roleを判定する。
3. サーバーは宛先Clientに必要なCueだけをシリアライズして送る。禁止されたVisual / Audio / Special Cueや、Pay専用の正解情報を他RoleのClientへ送ってはならない。
4. Clientは受信済みCueを描画・再生するPresentation層であり、Role判定による秘匿の最終防衛線ではない。

このため、Client側の「見せない」実装だけに依存しない。DevToolsで受信済みデータを読む行為までは防げないが、そもそも他Role専用データを配送しないことを要件とする。

## イベント境界

```ts
type WasshoiEvent = {
  type: 'WASSHOI'
  intensity: number
  durationMs: number
  pitch?: number
  burstCount?: number
}
```

- `WasshoiEvent` に認識テキスト、音声バイト列、録音URLを追加しない。
- Pay本人の発話を再生するためのローカルモニターが必要な場合も、送信するのは生音声ではなく同じWasshoi Sampleに限る。
- 切断・再接続中に失われた発話を後から再生する必要はない。これは状態ではなく一過性のCueである。

## 後続Issueへの反映

### #50 Wasshoi PoC

PoCはローカルで `WasshoiEvent` を生成・再生するまでを責務とする。ネットワーク接続は実装しないが、イベントの形は本書の契約に従い、生音声・認識結果を公開しない。

### #47 3人協力の同期設計

実装では次を満たす。

- WebRTC音声トラックをオドルノ / オラの通常音声にだけ接続する。
- Payに対しては音声トラックを作成・公開せず、`WasshoiEvent` の宛先を他2人に限定する。
- サーバー側のRole-based Cue Routerで、Roleごとのゲーム情報を配送前に分離する。
- 接続・Role偽装・誤配送をテストし、禁止Cueが対象外Roleの通信ペイロードに含まれないことを確認する。

## 受け入れ基準

- Payの生音声がネットワーク送信、録音、ログに含まれない。
- オドルノ / オラはゲーム内音声チャネルで会話できる。
- Payの発話は受信側でWasshoiとしてのみ再生される。
- Pay専用情報を含むRole専用Cueは、対象外Clientへ配送されない。

