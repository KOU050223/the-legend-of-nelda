/**
 * HUD の情報レイヤー。将来の Role 別配信で独立して切り替える
 * (docs/technical-design.md §5.5)。
 *
 * コンポーネントと同じファイルへ置くと Fast Refresh が状態を保てないため、
 * 値と型はここへ分ける。
 */
export const HUD_LAYERS = ['BOSS_HP', 'SLEEPINESS', 'WAKE_FORCE', 'ACTION_UI', 'EVENT_UI'] as const;

export type HudLayer = (typeof HUD_LAYERS)[number];

export interface HudProps {
  /** false のレイヤーだけを非表示にする。指定しないレイヤーは表示する。 */
  layers?: Partial<Record<HudLayer, boolean>>;
  /** イベントフィードバックの表示時間。 */
  eventDurationMs?: number;
}
