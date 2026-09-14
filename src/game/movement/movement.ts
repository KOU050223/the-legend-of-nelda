import type { MoveCharacterOptions, PlanarPosition } from './types';

/**
 * 入力から次フレームの位置を計算する Pure Function。
 *
 * R3F側はこの結果を Object3D へ反映するだけにする
 * (docs/technical-design.md §5.2 と同じ「入力は正規化してから渡す」方針)。
 *
 * 座標系は Three.js 標準 (Y = Up)。カメラは +Z 側から原点を見るため、
 * forward の正方向は -Z とする。
 *
 * 斜め入力は速度が √2 倍にならないよう normalize する。
 */
export function moveCharacter({
  position,
  input,
  speed,
  delta,
}: MoveCharacterOptions): PlanarPosition {
  const { forward, right } = input;

  const length = Math.hypot(forward, right);
  if (length === 0) return { x: position.x, z: position.z };

  const normalizedForward = forward / length;
  const normalizedRight = right / length;

  const distance = speed * delta;

  return {
    x: position.x + normalizedRight * distance,
    z: position.z - normalizedForward * distance,
  };
}

/**
 * 移動方向から Y軸回転角 (ラジアン) を求める。
 *
 * glTFモデルの正面は標準で -Z を向く。rotationY = 0 のとき -Z を向くように
 * 定義することで、将来 GLB キャラクターへ差し替えたときに向きの補正コードを
 * 別途書かずに済む。
 *
 * 入力が無ければ回転を変えない (現在の向きを維持) ため null を返す。
 * 将来 lerp / slerp で補間する側が呼び出し元で現在値と混ぜられるよう、
 * 角度計算そのものはここに閉じ込める。
 */
export function facingRotationY(input: { forward: number; right: number }): number | null {
  const { forward, right } = input;
  if (forward === 0 && right === 0) return null;

  return Math.atan2(-right, forward);
}
