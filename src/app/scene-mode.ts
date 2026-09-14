/**
 * 起動するシーンの選択。`?scene=<name>` で切り替える。
 *
 * ## 現状の位置づけ
 *
 * Phase 1 の戦闘 (`combat`) が既定で、`world` は開発用の暫定入口。
 * 本番ビルドでは無効にして、既定のシーンだけを出す (`import.meta.env.DEV`
 * は `pnpm build` では false になる)。まだ調整中の Phase 2 を、
 * デプロイ先で誰でも踏める状態にしないため。
 *
 * ## 本番の既定へ昇格させるとき
 *
 * 昇格の条件と、そのとき触るファイルは docs/phase2-boss-arena-spec.md §5
 * に決定として残してある。ここへ1箇所に集約してあるので、実際に変えるのは
 * `DEV_ONLY_SCENES` と `screen.ts` の初期画面だけで済む。
 */

export const SCENES = [
  /** Phase 1 の固定カメラ戦闘。現在の既定 (docs/technical-design.md §3.2)。 */
  'combat',
  /**
   * ワールド。草原に堀大輔が居て、その場で戦う (#55 / #56 / #58)。
   *
   * 探索用と戦闘用でシーンは分けない
   * (docs/phase2-gameplay-spec.md §2「1つの広めのボスマップ」)。
   */
  'world',
] as const;

export type SceneName = (typeof SCENES)[number];

/** 開発ビルドでしか選べないシーン。 */
const DEV_ONLY_SCENES: ReadonlySet<SceneName> = new Set<SceneName>(['world']);

function isSceneName(value: string | null): value is SceneName {
  return value !== null && (SCENES as readonly string[]).includes(value);
}

/**
 * URL で指定されたシーン。指定が無ければ null。
 *
 * 未知の名前・本番ビルドでの開発専用シーンの指定は、エラーにせず null に
 * する。URL を手で書き換えた結果で画面が真っ白になるより、既定の画面が
 * 出た方が状況が分かる。
 */
export function requestedScene(search?: string): SceneName | null {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const requested = new URLSearchParams(query).get('scene');

  // 指定が無い / 知らない名前は null。「既定へ落ちた」と「combat を明示した」
  // を呼び出し側が区別できるようにする。前者はタイトルから始めたいが、
  // 後者は戦闘を直接開きたいという指定なので、同じ扱いにできない。
  if (!isSceneName(requested)) return null;
  if (DEV_ONLY_SCENES.has(requested) && !import.meta.env.DEV) return null;

  return requested;
}
