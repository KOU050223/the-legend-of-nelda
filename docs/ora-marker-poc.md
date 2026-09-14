# ORA marker input PoC

Issue #49 はゲーム本体に接続しない独立PoCであり、`/?debug=ora` で開く。

## ライブラリ選定

`@ar-js-org/aruco-rs@0.1.0` を採用する。MITライセンスのWASM/ESMパッケージで、RGBA
フレームを入力に ID と四隅を返す。Vite 8の本番ビルドで読み込め、カメラ取得・Three.js
描画・ゲーム入力を抱え込まない。
AR.js は Three.js / A-Frame のカメラ・レンダラー統合を含むため、この既存R3F画面では
責務が重複する。ライブラリ固有値は `aruco-marker-detector.ts` に閉じ込め、後段は
`MarkerObservation` だけを扱う。

## 動かし方

1. `pnpm dev` を起動して `http://localhost:5173/?debug=ora` を開く。
2. カメラを開始し、標準 ARUCO の ID 0 を LEFT、ID 1 を RIGHT として映す。
3. 画面上で両マーカーを左右に移動、RIGHTを素早く振る、両方を上げて左右に広げる。

画面を離れるか「カメラを停止」を押すと、取得した `MediaStream` の全トラックを停止する。
