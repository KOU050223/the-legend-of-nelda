import { ARENA_RADIUS } from '@/game/arena/arena';
import { pseudoRandom, ringLayout, type RingLayoutOptions } from '@/game/arena/ring-layout';

/**
 * 外周の景色 (岩・木) を置くために、プレイ可能範囲の外へ取る余白。
 *
 * **プレイ可能範囲 (`ARENA_RADIUS`) とは別物**。地面をプレイ可能範囲ぴったりに
 * すると、境界を示すための岩や木の足元から地面が消えて宙に浮く。
 */
const SCENERY_MARGIN = 20;

/** 地面 (Plane) の一辺。外周の景色の下まで敷く。 */
export const GROUND_SIZE = (ARENA_RADIUS + SCENERY_MARGIN) * 2;

/**
 * 境界を示す岩の帯。プレイ可能範囲のすぐ外側へ置き、
 * 「ここから先へは行けない」を見た目で伝える。
 */
export const ROCK_RING = { innerRadius: ARENA_RADIUS + 2, outerRadius: ARENA_RADIUS + 4.8 };

/** 岩のさらに外側の木立。遠景として奥行きを出す。SCENERY_MARGIN の内側へ収める。 */
export const TREE_RING = { innerRadius: ARENA_RADIUS + 7, outerRadius: ARENA_RADIUS + 16 };

/** 草を生やす範囲。アリーナの床いっぱい。 */
export const GRASS_RING = { innerRadius: 0, outerRadius: ARENA_RADIUS - 0.5 };

export interface PropPlacement {
  x: number;
  z: number;
  /** Y軸回転 (見た目のバリエーション用)。 */
  rotationY: number;
  /** 基準サイズへの倍率。 */
  scale: number;
}

/**
 * 境界の目印 (木・岩・草) を「壁のように隙間なく」ではなく「自然にばらけた縁」
 * として見せるための配置。
 *
 * 座標そのものは Game層の `ringLayout` が決め、ここでは向きと大きさという
 * **見た目だけの値**を足す (docs/technical-design.md §4)。当たり判定や
 * ゲーム上の意味は持たない。
 */
export function propRingLayout(options: RingLayoutOptions): PropPlacement[] {
  const seed = options.seed ?? 0;

  return ringLayout(options).map((point, index) => ({
    x: point.x,
    z: point.z,
    rotationY: pseudoRandom(seed + index * 3) * Math.PI * 2,
    scale: 0.8 + pseudoRandom(seed + index * 5) * 0.5,
  }));
}
