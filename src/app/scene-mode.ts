/**
 * `?scene=world` でワールド探索モードの動作確認ができるようにする開発用の口。
 * Character基盤 (Issue #41) の完成条件確認用で、素材が揃うまでの暫定入口。
 * 既存Combatの起動経路・挙動は変えない。
 */
export function isWorldSceneRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('scene') === 'world';
}
