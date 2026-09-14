export interface PropPlacement {
  x: number;
  z: number;
  /** Y軸回転 (見た目のバリエーション用)。 */
  rotationY: number;
  /** 基準サイズへの倍率。 */
  scale: number;
}

/**
 * 0〜1 の決定論的な擬似乱数。`Math.random()` は使わない
 * (再レンダーのたびに配置が変わってしまうため)。同じ seed には常に
 * 同じ値を返す。
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export interface RingLayoutOptions {
  count: number;
  /** リングの内側の半径。 */
  innerRadius: number;
  /** リングの外側の半径。 */
  outerRadius: number;
  /** 配置の再現性を変えるための seed オフセット。 */
  seed?: number;
}

/**
 * 原点を中心にしたリング状 (ドーナツ状) の帯へ、角度と半径をずらして
 * props を並べる。境界の目印 (木・岩) を「壁のように隙間なく」ではなく
 * 「自然にばらけた縁」として見せるための配置関数。
 */
export function ringLayout({
  count,
  innerRadius,
  outerRadius,
  seed = 0,
}: RingLayoutOptions): PropPlacement[] {
  const placements: PropPlacement[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + pseudoRandom(seed + i * 2) * 0.3;
    const radius = innerRadius + pseudoRandom(seed + i * 2 + 1) * (outerRadius - innerRadius);

    placements.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      rotationY: pseudoRandom(seed + i * 3) * Math.PI * 2,
      scale: 0.8 + pseudoRandom(seed + i * 5) * 0.5,
    });
  }

  return placements;
}
