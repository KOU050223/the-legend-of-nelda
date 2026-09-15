# LiveKit Voice Chat 手動検証

Issue #114以降、Voice Chatは通常の `MATCHING → GAME` 導線で使用する。Voice Sessionは画面遷移だけでは切断せず、GAME中は右上の最小HUDで状態を確認できる。`?debug=voice` は開発用の接続基盤確認だけに残す。

Vite 開発サーバーは LAN からのマイク確認のため、自己署名証明書で HTTPS を有効にしている。初回だけブラウザの証明書警告で詳細を開き、開発サーバーへの接続を続行する。これはローカル検証限定であり、発表・本番では信頼済みの HTTPS ホストを使う。

## Token の準備

`LiveKit API Secret` を Vite の `VITE_*` 変数、Git、ブラウザへ入れてはいけない。発表用は token endpoint が API Secret を server-side secret として保持し、次のリクエストを検証して短命 token を返す。

```http
POST /api/livekit/token
content-type: application/json

{"roomName":"nelda-demo","playerId":"daisuke-a","role":"PAY"}
```

レスポンスは `{ "url": "wss://…", "token": "…" }`。endpoint は認証済みプレイヤーの identity と role をサーバー側で確定し、Pay には `canPublishSources: [DATA]`、Odoruno/Ora には `[MICROPHONE, DATA]` を付与する。クライアントから渡された role を信用してはならない。

通常ゲーム導線では以下を設定する。`VITE_LIVEKIT_ROOM_NAME` は秘密ではないが、同じAuthority Sessionを表す値にする。現在のAuthorityは単一の3人Roomなので、既定の `nelda-demo` を使える。複数Room化時はAuthorityが配信するsession IDを優先する。

```env
VITE_AUTHORITY_WS_URL=ws://localhost:3000
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
VITE_LIVEKIT_TOKEN_ENDPOINT=https://your-worker.example.com/api/livekit/token
VITE_LIVEKIT_ROOM_NAME=nelda-demo
```

`VITE_LIVEKIT_TOKEN_ENDPOINT` はLiveKit Cloudから発行される値ではない。API Key / SecretをWorker等のサーバー側Secretとして保持し、短命Tokenを発行するバックエンドをデプロイして設定する。`LIVEKIT_API_SECRET` を `VITE_*`・Git・ブラウザへ置いてはならない。

静的サイトだけで行う短期 PoC は、Cloud dashboard が発行した短命・room/identity 固定の token を Voice Debug の `DEV TOKEN` へ入力してよい。token は環境変数・localStorage・Gitへ保存しない。

さらに手早く試す場合は、LiveKit Cloud の Project Settings で **Development Token Server** を有効化し、表示される `token-server-...` ID を Voice Debug の `DEVELOPMENT TOKEN SERVER ID` へ入力する。`開発用 token を発行する` を押すと、入力済みの ROOM / PLAYER ID / ROLE で短命 token を取得する。この機能は誰でも任意の token を発行できる開発用の仕組みなので、本番・発表環境では使わない。

## 通常ゲーム導線での3 Client確認

1. Token Endpointと上記環境変数を設定し、`pnpm dev:server` と `pnpm dev` を起動する。3 台のPCまたは3つのブラウザプロファイルで `https://<開発PCのLAN IP>:5173` を開く。初回は自己署名証明書の警告を許可する。
2. 各Clientでタイトルから進み、MATCHINGへ入る。Authorityは3人固定のため、余分なゲームタブを閉じてから開始する。
3. `ODORUNO`、`PAY`、`ORA` を一人ずつ選ぶ。Role確定後に `VOICE CHAT` が表示されることを確認する。
4. OdorunoとOraでは **マイクを有効にする** を押して許可する。`VOICE CONNECTED` と `MIC: ON` を確認し、双方の通常音声が相互に届くこと、OFFで停止することを確認する。
5. Payでは **VOICEを有効にする** を押して許可する。`MIC: WASSHOI MODE` と `WASSHOI INPUT: ACTIVE` を確認する。Payが普通に話すと、Odoruno/Ora側だけが「わっしょーい」を再生し、Payの生声は届かないことを確認する。Pay自身では生成された「わっしょーい」を再生しないことも確認する。
6. 3人が揃ったらSTARTする。GAME中、右上HUDが `VOICE CONNECTED` と各ClientのMic/WASSHOI状態を維持することを確認する。
7. 1人を切断・再接続し、残る2人の通話が維持されること、再接続後にremote audioが二重再生されないことを確認する。
8. PAYのマイク許可を拒否してもRoom接続とゲームは維持され、`VOICE ERROR` だけが表示されることを確認する。
9. TITLEへ戻り、再度MATCHINGへ入る。古いRoom、マイク利用、WASSHOI入力、remote audioが残らないことを確認する。

## Token Endpoint未設定時のフォールバック

Token Endpointが未設定または失敗しても、MATCHINGとGAMEは継続する。`VOICE DISCONNECTED` / `VOICE ERROR` が表示されることを確認する。この状態では実通話・マイク・PAYのWASSHOI入力は検証できない。

`WASSHOI` data は LiveKit の reliable data topic `nelda.wasshoi.v1` に `{ type, intensity, durationMs }` のみを送る。生音声、PCM、文字起こし、録音 URL は送信しない。
