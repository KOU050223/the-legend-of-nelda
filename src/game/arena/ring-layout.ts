export interface RingPoint {
  x: number;
  z: number;
  /**
   * 原点から見た角度 (rad)。`Math.atan2(z, x)` と同じ向きの定義。
   * 「中心を向く」向きの計算 (`arena.ts`) や、帯の中での並び順を
   * 呼び出し側が再計算せずに済むよう、座標と一緒に返す。
   */
  angle: number;
}

export interface RingLayoutOptions {
  count: number;
  /** リングの内側の半径。 */
  innerRadius: number;
  /** リングの外側の半径。 */
  outerRadius: number;
  /** 配置の再現性を変えるための seed オフセット。 */
  seed?: number;
  /** 1点目の角度 (rad)。別のリングと角度をずらして互い違いに並べるために使う。 */
  angleOffset?: number;
  /**
   * 角度へ乗せる揺らぎの最大値 (rad)。
   *
   * 見た目の props (木・岩・草) は既定値のままばらけさせる。
   * 位置そのものが意味を持つゲーム用アンカー (装置・安全地帯) は 0 を渡し、
   * 等間隔に並べる。
   */
  angleJitter?: number;
}

/** 見た目の props 向けの既定の揺らぎ幅 (rad)。 */
export const DEFAULT_ANGLE_JITTER = 0.3;

/**
 * 0〜1 の決定論的な擬似乱数。`Math.random()` は使わない
 * (再レンダーのたびに配置が変わってしまうため)。同じ seed には常に
 * 同じ値を返す。
 */
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 原点を中心にしたリング状 (ドーナツ状) の帯へ、角度と半径をずらして
 * 点を並べる。
 *
 * 返すのは座標と角度だけで、大きさ・向きといった見た目の値は持たない
 * (Game Logic と Presentation の分離、docs/technical-design.md §4)。
 * 見た目のばらつきは Rendering 側の `propRingLayout` が足す。
 *
 * `innerRadius === outerRadius` かつ `angleJitter: 0` なら、半径固定・
 * 等間隔の配置になる。装置や安全地帯のアンカーはこの使い方をする。
 */
export function ringLayout({
  count,
  innerRadius,
  outerRadius,
  seed = 0,
  angleOffset = 0,
  angleJitter = DEFAULT_ANGLE_JITTER,
}: RingLayoutOptions): RingPoint[] {
  const points: RingPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle =
      angleOffset + (i / count) * Math.PI * 2 + pseudoRandom(seed + i * 2) * angleJitter;
    const radius = innerRadius + pseudoRandom(seed + i * 2 + 1) * (outerRadius - innerRadius);

    points.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle });
  }

  return points;
}
