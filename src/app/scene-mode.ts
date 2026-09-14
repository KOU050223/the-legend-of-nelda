/**
 * `?scene=world` でボスアリーナ (Issue #54) の動作確認ができるようにする開発用の口。
 * 既存Combatの起動経路・挙動は変えない。
 *
 * 本番ビルドでは無効にする。アリーナにはまだボスも戦闘も無く、既定シーンへ
 * 昇格させるとデプロイ先で動いている Phase 1 のデモが歩けるだけの画面に
 * 置き換わるため (`import.meta.env.DEV` は `pnpm build` では false になる)。
 *
 * 本番の既定シーンへ昇格させる条件と、そのとき触るファイルは
 * docs/phase2-boss-arena-spec.md §5 に決定として残してある。
 */
export function isWorldSceneRequested(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('scene') === 'world';
}
