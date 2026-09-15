/**
 * Blender の出力からビルドの成否を読む。
 *
 * プラグイン本体とは別のファイルへ置く。本体はモジュールの読み込み時に
 * リポジトリのパスを解決するので、ブラウザ向けのテスト環境から読めない。
 * 判断そのものは入出力が文字列だけで完結するため、ここへ切り出して
 * 単体でテストする。
 */

/**
 * 出力がビルドの失敗を示しているか。
 *
 * **`blender --background --python` は、スクリプトが例外で落ちても終了コード
 * 0 を返す。** 例外は出力へ Traceback として出るだけなので、終了コードだけを
 * 見ていると失敗を成功として扱ってしまう。出力の中身で判断する。
 */
export function isBuildFailure(log: string): boolean {
  return log.includes('Traceback (most recent call last)') || /^\w*Error:/m.test(log);
}
