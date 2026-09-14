/**
 * 自身でキー入力を扱う要素。ここへフォーカスがある間はゲーム入力へ回さない。
 *
 * 設定UIのスライダーは矢印キーで動かし、チェックボックスは Space で切り替える。
 * どちらもゲームの回避・攻撃・移動と同じキーなので、素通しすると設定を触るたびに
 * 入力が暴発し、preventDefault() でスライダー自体も動かなくなる。
 */
const INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
  'INPUT',
  'BUTTON',
  'SELECT',
  'TEXTAREA',
  'OPTION',
]);

/** イベントの発生源が自分でキーを処理する要素か。 */
export function isFromInteractiveElement(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  return INTERACTIVE_TAGS.has(target.tagName) || target.isContentEditable;
}
