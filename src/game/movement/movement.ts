import type { CircularBounds, MoveCharacterOptions, PlanarPosition } from './types';

/**
 * 原点を中心とした円の中へ位置を丸める。
 *
 * 半径だけを丸めて角度は保つため、壁へ斜めに押し当てたときに接線方向の
 * 成分が残り、止まらずに壁沿いへ滑る。ブルーライト照射から走って逃げる
 * 場面 (docs/phase2-gameplay-spec.md §9.2) で壁に張り付かないようにするため。
 */
export function clampToBounds(position: PlanarPosition, bounds: CircularBounds): PlanarPosition {
  const distance = Math.hypot(position.x, position.z);
  if (distance <= bounds.radius || distance === 0) return { x: position.x, z: position.z };

  const scale = bounds.radius / distance;
  return { x: position.x * scale, z: position.z * scale };
}

/**
 * `from` から `rotationY` の向きへ進んだとき、境界へ届くまでの距離。
 *
 * 向きの規約は `facingRotationY` と共通で、rotationY = 0 が -Z を向く。
 * 呼び出し側が向きベクトルへ直す式を書き写さずに済むよう、変換もここへ閉じる。
 *
 * 円と半直線の交点を解く。`p = from・進行方向`、`g = 半径² - |from|²` として
 * `√(p² + g) - p`。境界上 (g = 0) もこの式で正しく、外向きなら 0、内向きなら
 * 直径ぶんを返す。壁際に居るときだけ動けなくなる、という扱いにはしない。
 *
 * 0 を返すのは **本当に境界の外にある** `from` だけ。復元した古い状態に
 * 範囲外の座標が入っていても、そこから更に外へ進ませないための防御。
 */
export function distanceToBounds(
  from: PlanarPosition,
  rotationY: number,
  bounds: CircularBounds,
): number {
  const forwardX = -Math.sin(rotationY);
  const forwardZ = -Math.cos(rotationY);
  const projection = from.x * forwardX + from.z * forwardZ;

  const distance = Math.hypot(from.x, from.z);
  if (distance > bounds.radius) return 0;

  // 半径² - 距離² を積の形で求める。差のまま引くと桁落ちで境界上が微小な負に
  // なり、内向きでも 0 を返してしまう。積なら距離が半径と一致したとき厳密に 0
  // になり、上の判定とも必ず揃う。
  const gap = (bounds.radius - distance) * (bounds.radius + distance);

  return Math.sqrt(projection * projection + gap) - projection;
}

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
 *
 * `bounds` を渡した場合、返す位置は必ずその中へ収まる。入力の有無に
 * よらずクランプするので、呼び出し側が経路ごとに気を配らなくてよい。
 */
export function moveCharacter({
  position,
  input,
  speed,
  delta,
  bounds,
}: MoveCharacterOptions): PlanarPosition {
  const { forward, right } = input;

  const length = Math.hypot(forward, right);
  const distance = speed * delta;

  const next =
    length === 0
      ? { x: position.x, z: position.z }
      : {
          x: position.x + (right / length) * distance,
          z: position.z - (forward / length) * distance,
        };

  return bounds ? clampToBounds(next, bounds) : next;
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
