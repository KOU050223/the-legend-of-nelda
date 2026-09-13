/**
 * HUD の情報レイヤー。将来の Role 別配信で独立して切り替える
 * (docs/technical-design.md §5.5)。
 *
 * コンポーネントと同じファイルへ置くと Fast Refresh が状態を保てないため、
 * 値と型はここへ分ける。
 */
export const HUD_LAYERS = [
  'BOSS_HP',
  'SLEEPINESS',
  'WAKE_FORCE',
  'ACTION_UI',
  'EVENT_UI',
  /**
   * チュートリアルの操作補助表示。キー凡例 (ACTION_UI) とは別のレイヤーにする。
   * 凡例は常時出す操作説明だが、こちらは「今この技に何で応じるか」を示す
   * 答えそのもので、本戦では出してはいけない (SEQ-003 / SEQ-004)。
   */
  'TUTORIAL_UI',
] as const;

export type HudLayer = (typeof HUD_LAYERS)[number];

export interface HudProps {
  /** false のレイヤーだけを非表示にする。指定しないレイヤーは表示する。 */
  layers?: Partial<Record<HudLayer, boolean>>;
  /** イベントフィードバックの表示時間。 */
  eventDurationMs?: number;
}
