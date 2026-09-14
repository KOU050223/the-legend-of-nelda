/**
 * 正規化された移動入力。DOM の KeyboardEvent は渡さず、ここへ変換してから
 * Movement Logic へ渡す (docs/technical-design.md §5.2 と同じ設計方針)。
 *
 * 各成分は -1 / 0 / 1 のデジタル入力を想定する (キーボードの押下状態)。
 * `moveCharacter` はベクトルを常に単位長へ正規化するため、途中の値
 * (例: アナログスティックの半押しによる 0.5) を渡しても大きさは保持されず、
 * 方向だけが -1/0/1 のときと同じ速さで反映される。将来アナログ入力
 * (ゲームパッド等) を扱う場合は、この正規化の扱いを見直す必要がある。
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

/**
 * 移動できる範囲。原点を中心とした円で表す。
 *
 * ボスアリーナは中央にボス・外周に装置を置く円形の構造なので
 * (docs/phase2-boss-arena-spec.md)、境界も円1つで表せる。矩形や任意形状が
 * 必要になるまでは増やさない。
 */
export interface CircularBounds {
  /** 原点からの最大距離。 */
  radius: number;
}

export interface MoveCharacterOptions {
  position: PlanarPosition;
  input: MovementInput;
  /** 1秒あたりの移動量。 */
  speed: number;
  /** 直前フレームからの経過秒。 */
  delta: number;
  /** 移動できる範囲。省略すると制限しない。 */
  bounds?: CircularBounds;
}
