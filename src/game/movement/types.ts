/**
 * 正規化された移動入力。DOM の KeyboardEvent は渡さず、ここへ変換してから
 * Movement Logic へ渡す (docs/technical-design.md §5.2 と同じ設計方針)。
 */
export interface MovementInput {
  /** 前後方向。前進が正。 */
  forward: number;
  /** 左右方向。右が正。 */
  right: number;
}

/** XZ平面上の位置。Y (高さ) は Movement では扱わない。 */
export interface PlanarPosition {
  x: number;
  z: number;
}

export interface MoveCharacterOptions {
  position: PlanarPosition;
  input: MovementInput;
  /** 1秒あたりの移動量。 */
  speed: number;
  /** 直前フレームからの経過秒。 */
  delta: number;
}
