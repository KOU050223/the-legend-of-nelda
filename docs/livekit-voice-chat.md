# LiveKit Voice Chat 手動検証

Issue #82 の Voice Chat は `?debug=voice` の専用画面で確認する。ゲームの通常画面には常駐させない。開発用には画面の `LIVEKIT PROJECT URL` と `DEV TOKEN` へ直接入力できる。この token は localStorage 等へ保存しないため、同じ開発サーバーを複数PCで共有しても、各PCは別の短命 token を使える。

Vite 開発サーバーは LAN からのマイク確認のため、自己署名証明書で HTTPS を有効にしている。初回だけブラウザの証明書警告で詳細を開き、開発サーバーへの接続を続行する。これはローカル検証限定であり、発表・本番では信頼済みの HTTPS ホストを使う。

## Token の準備

`LiveKit API Secret` を Vite の `VITE_*` 変数、Git、ブラウザへ入れてはいけない。発表用は token endpoint が API Secret を server-side secret として保持し、次のリクエストを検証して短命 token を返す。

```http
POST /api/livekit/token
content-type: application/json

{"roomName":"nelda-demo","playerId":"daisuke-a","role":"PAY"}
```

レスポンスは `{ "url": "wss://…", "token": "…" }`。endpoint は認証済みプレイヤーの identity と role をサーバー側で確定し、Pay には `canPublishSources: [DATA]`、Odoruno/Ora には `[MICROPHONE, DATA]` を付与する。クライアントから渡された role を信用してはならない。

静的サイトだけで行う短期 PoC は `.env` に `VITE_LIVEKIT_URL` と、Cloud dashboard が発行した短命・room/identity 固定の `VITE_LIVEKIT_DEV_TOKEN` を置いてよい。これは token を**発行する**秘密ではない。`.env.example` をコピーし、実 token はコミットしない。

## 3 Client 確認

1. `pnpm dev` を起動し、3 台の PC または 3 つのブラウザプロファイルで `https://<開発PCのLAN IP>:5173/?debug=voice` を開く。初回は自己署名証明書の警告を許可する。1台だけなら `https://localhost:5173/?debug=voice` でよい。
2. 各画面へ同じ `LIVEKIT PROJECT URL` と、役ごとに異なる Dashboard 発行 token を入力する。`ROOM` は token 作成時の room と同じ値、`PLAYER ID` は token identity と同じ値にする。役割は `ODORUNO`、`ORA`、`PAY` に一人ずつ設定する。
3. 各 Client で **ROOM に接続する**。参加者数・発話中表示が全 Client で変化することを確認する。
4. Odoruno/Ora の **マイクを ON** を押して権限を許可し、相互に通常音声が届くこと、OFF で停止することを確認する。
5. Pay の **わっしょーい入力を有効にする** を押して普通に話す。Pay の表示が `MIC TRACK: WASSHOI MODE` のままで、他 2 Client だけが声量・長さに応じた「わっしょーい」を再生することを確認する。
6. いずれかを切断し、残る 2 Client の音声と表示が維持されることを確認する。再接続後に remote audio が二重再生されないことも確認する。
7. マイク許可を拒否しても、接続済み Room が維持され、エラー表示だけになることを確認する。

`WASSHOI` data は LiveKit の reliable data topic `nelda.wasshoi.v1` に `{ type, intensity, durationMs }` のみを送る。生音声、PCM、文字起こし、録音 URL は送信しない。
