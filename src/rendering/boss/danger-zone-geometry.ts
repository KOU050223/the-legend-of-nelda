/**
 * 危険範囲を Three.js の形へ落とすための計算。
 *
 * コンポーネントのファイルから分けてあるのは、Fast Refresh が
 * コンポーネント以外の export を含むファイルで状態を保てないため。
 */

/**
 * 突進の矩形を地面へ寝かせ、進行方向へ向ける Euler 角。
 *
 * planeGeometry は XY 平面にあるので、まず X を -90度 回して地面へ寝かせ、
 * そのあと Z で進行方向へ向ける。**Z の符号を反転させてはいけない。**
 * 反転しても 0 / 90 / 180度 では偶然一致するが、45度 のような斜めで
 * 描画と当たり判定がずれ、避けたつもりの場所で被弾する。
 *
 * 判定側 (`danger-zone.ts`) が前方を `(-sinθ, -cosθ)` としているので、
 * ここもそれと同じ向きになる角度を返す。一致はテストで固定してある。
 */
export function lineMarkRotation(rotationY: number): [number, number, number] {
  return [-Math.PI / 2, 0, rotationY];
}

/** 危険範囲を識別する安定なキー。形と位置が変わらない限り同じ値になる。 */
export function dangerZoneKey(zone: {
  origin: { x: number; z: number };
  shape: { kind: string };
  rotationY: number;
}): string {
  const { origin, shape, rotationY } = zone;
  return `${shape.kind}:${origin.x.toFixed(2)}:${origin.z.toFixed(2)}:${rotationY.toFixed(3)}`;
}
