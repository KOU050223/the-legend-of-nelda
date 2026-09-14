/**
 * 起動するシーンの選択。`?scene=<name>` で切り替える。
 *
 * ## 現状の位置づけ
 *
 * Phase 1 の戦闘 (`combat`) が既定で、`world` / `boss` は開発用の暫定入口。
 * 本番ビルドでは無効にして、既定のシーンだけを出す (`import.meta.env.DEV`
 * は `pnpm build` では false になる)。自由移動できるプレースホルダー画面を
 * デプロイ先で誰でも踏める状態にしないため。
 *
 * ## #54 での扱い
 *
 * `?scene=world` の暫定入口をどうするかの決定は #54（ボスアリーナ）の
 * 完了条件に入っている。Phase 2 が本番になった時点で、既定を `boss` 側へ
 * 移して `combat` を畳む形になる見込み。ここを1箇所へ集約してあるので、
 * そのときは `DEFAULT_SCENE` と `DEV_ONLY_SCENES` を変えるだけで済む。
 */

export const SCENES = [
  /** Phase 1 の固定カメラ戦闘。現在の既定 (docs/technical-design.md §3.2)。 */
  'combat',
  /** ワールド探索モード。Character基盤 (#41) の動作確認用。 */
  'world',
  /** 堀大輔とのボス戦。Phase 2 (#55 / #56 / #58)。 */
  'boss',
] as const;

export type SceneName = (typeof SCENES)[number];

/** `?scene=` の指定が無いときに起動するシーン。 */
export const DEFAULT_SCENE: SceneName = 'combat';

/** 開発ビルドでしか選べないシーン。 */
const DEV_ONLY_SCENES: ReadonlySet<SceneName> = new Set<SceneName>(['world', 'boss']);

function isSceneName(value: string | null): value is SceneName {
  return value !== null && (SCENES as readonly string[]).includes(value);
}

/**
 * 起動するシーンを決める。
 *
 * 未知の名前・本番ビルドでの開発専用シーンの指定は、エラーにせず既定へ
 * 落とす。URL を手で書き換えた結果で画面が真っ白になるより、既定の画面が
 * 出た方が状況が分かる。
 */
export function requestedScene(search?: string): SceneName {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const requested = new URLSearchParams(query).get('scene');

  if (!isSceneName(requested)) return DEFAULT_SCENE;
  if (DEV_ONLY_SCENES.has(requested) && !import.meta.env.DEV) return DEFAULT_SCENE;

  return requested;
}
