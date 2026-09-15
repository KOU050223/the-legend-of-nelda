/** 検出器が正規化して渡す、画面上のマーカー1枚の状態。座標と速度は 0〜1。 */
export interface MarkerPosition {
  x: number;
  y: number;
  size: number;
  velocityX: number;
  velocityY: number;
}

/**
 * カメラフレームの認識結果。ARライブラリ固有の corners や ID はここへ持ち込まない。
 * MarkerDetector の実装を差し替えても、以降の Gesture / Input 層はこの型だけを見る。
 */
export interface MarkerObservation {
  capturedAt: number;
  left?: MarkerPosition;
  right?: MarkerPosition;
}

/** MediaPipeなどの手追跡器が渡す、左右手首の正規化済み観測値。 */
export interface HandObservation {
  capturedAt: number;
  left?: Pick<MarkerPosition, 'x' | 'y' | 'velocityX' | 'velocityY'>;
  right?: Pick<MarkerPosition, 'x' | 'y' | 'velocityX' | 'velocityY'>;
}

export const ORA_GAME_ACTIONS = [
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'MOVE_FORWARD',
  'MOVE_BACKWARD',
  'ATTACK',
  'ORA_ACTION',
] as const;

export type OraGameAction = (typeof ORA_GAME_ACTIONS)[number];
export type OraMoveAction = Extract<OraGameAction, 'MOVE_LEFT' | 'MOVE_RIGHT'>;

export interface OraRecognition {
  move: OraMoveAction | null;
  actions: readonly Extract<OraGameAction, 'ATTACK' | 'ORA_ACTION'>[];
  attackReady: boolean;
  oraPoseProgress: number;
}
