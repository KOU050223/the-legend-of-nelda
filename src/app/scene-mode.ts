/**
 * `?scene=world` でワールド探索モードの動作確認ができるようにする開発用の口。
 * Character基盤 (Issue #41) の完成条件確認用で、素材が揃うまでの暫定入口。
 * 既存Combatの起動経路・挙動は変えない。
 *
 * 本番ビルドでは無効にする。Phase 1 は固定カメラ・戦闘のみを想定しており
 * (docs/technical-design.md §3.2)、自由移動できるプレースホルダー画面を
 * デプロイ先で誰でも踏める状態にしないため (`import.meta.env.DEV` は
 * `pnpm build` では false になる)。
 */
export function isWorldSceneRequested(): boolean {
  return requestedScene() === 'world';
}

/**
 * `?scene=boss` で堀大輔の危険範囲を目視確認できるようにする開発用の口。
 * (Issue #58)
 *
 * `?scene=world` と同じく暫定入口で、本番ビルドでは無効にする。ボスアリーナ
 * 本体は #54 のスコープなので、ここは「危険範囲が視覚的に読めるか」を
 * 確かめるための最小の画面に留める。
 */
export function isBossSceneRequested(): boolean {
  return requestedScene() === 'boss';
}

function requestedScene(): string | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('scene');
}
