/**
 * 演出 (SE / VFX) の出し方の設定。docs/single-player-poc-spec.md §20 /
 * docs/technical-design.md §5.3 / §5.4。
 *
 * Presentation 層だけが読む値で、Game Logic は参照しない。ここを 0 や false に
 * しても判定・State 遷移・HP は一切変わらない (Issue #11 完了条件
 * 「Visual Cue / Audio Cue を個別に無効化してもゲームロジックが壊れない」)。
 *
 * BossAttack.cues (ATK-BASE-002 / ATK-BASE-003) との違い:
 * あちらは「技が Cue イベントを発行するか」という Game Logic 側のスイッチで、
 * チュートリアルが技単位で予兆を落とすために使う。こちらは発行済みの
 * イベントを「受け取った演出側が再生するか」というユーザー設定。
 * 層が違うので統合せず、両方を通過した Cue だけが音と絵になる。
 */

/**
 * 演出の強さ。0 で無効、1 で既定、それ以上で誇張。
 *
 * 音量・カメラシェイクの振幅・フラッシュの不透明度へ共通で掛ける係数。
 * 強度 0 は「その演出が出ない」という点で OFF と同じ結果になるが、
 * enabled とは別軸で持つ。OFF は恒久的な設定 (音を切る) を、強度は
 * 見やすさの調整 (シェイクを弱める) を表しており、強度を下げた人が
 * あとで OFF を解除したときに元の強さへ戻せる必要があるため。
 */
export type EffectIntensity = number;

export interface PresentationSettings {
  /** 音の演出全体。false で Audio Cue / ヒットSE を鳴らさない。 */
  audioEnabled: boolean;
  /** 絵の演出全体。false で軌跡・衝撃波・シェイク・フラッシュを出さない。 */
  visualEnabled: boolean;
  /** SE の音量へ掛ける係数。 */
  audioIntensity: EffectIntensity;
  /** カメラシェイク・フラッシュ・ヒットストップの強さへ掛ける係数。 */
  visualIntensity: EffectIntensity;
}

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  audioEnabled: true,
  visualEnabled: true,
  audioIntensity: 1,
  visualIntensity: 1,
};

/** 強度は負値を取らない。設定値の取り違えで演出が反転しないよう下限で止める。 */
export function clampIntensity(intensity: EffectIntensity): number {
  return Number.isFinite(intensity) ? Math.max(0, intensity) : 0;
}

/** 音の演出に実際に掛かる係数。無効なら 0。 */
export function audioScale(settings: PresentationSettings): number {
  return settings.audioEnabled ? clampIntensity(settings.audioIntensity) : 0;
}

/** 絵の演出に実際に掛かる係数。無効なら 0。 */
export function visualScale(settings: PresentationSettings): number {
  return settings.visualEnabled ? clampIntensity(settings.visualIntensity) : 0;
}
