/** Pay大輔の発話内容を持たず、勢いだけを表すイベント。(Issue #50) */
export interface WasshoiEvent {
  type: 'WASSHOI';
  /** 0〜1。発話中の最大RMSを正規化した値。 */
  intensity: number;
  /** 発話開始からhangoverを除いた終了までの長さ。 */
  durationMs: number;
}

export type VoiceActivityState = 'silence' | 'speaking';

export interface VoiceActivityConfig {
  /** このRMS未満は環境ノイズとして無視する。 */
  threshold: number;
  /** 短い無音で同一発話を分断しないための猶予。 */
  hangoverMs: number;
  /** 極端に長い発話を強制的に確定する上限。 */
  maxDurationMs: number;
}

export const DEFAULT_VOICE_ACTIVITY_CONFIG: VoiceActivityConfig = {
  // 一般的な内蔵マイクの通常発話は0.01前後になることがあるため、まずは小さめにする。
  // Debug画面で実測RMSを見ながら上げ、環境ノイズによる誤検出を抑える。
  threshold: 0.008,
  hangoverMs: 300,
  maxDurationMs: 10_000,
};

export interface WasshoiDebugSnapshot {
  state: VoiceActivityState;
  rms: number;
  /** 発話中の経過時間。無音時は0。 */
  durationMs: number;
  /** 発話中の最大RMSから求めた値。無音時は0。 */
  intensity: number;
  /** 無音中に推定した環境ノイズのRMS。 */
  noiseFloor: number;
  /** 手動閾値と環境ノイズから決めた実効閾値。 */
  effectiveThreshold: number;
  lastEvent: WasshoiEvent | null;
}
