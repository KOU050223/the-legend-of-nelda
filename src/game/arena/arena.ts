import type { CircularBounds, PlanarPosition } from '@/game/movement/types';

import { ringLayout, type RingPoint } from './ring-layout';

/**
 * ボスアリーナの形と、そこに置くものの座標。
 *
 * 仕様と数値の根拠は docs/phase2-boss-arena-spec.md。
 * Pure TypeScript で持ち、Rendering (見た目) と Game Logic (判定) の
 * 両方がここを参照する (docs/technical-design.md §4)。
 */

/**
 * プレイヤーが移動できる円の半径。
 *
 * 移動速度 4 units/秒 に対して中心から端まで6秒・端から端まで12秒。
 * ブルーライト照射から逃げ回れる広さと、集合し直せる近さの折衷
 * (docs/phase2-gameplay-spec.md §9.2 / §9.3)。
 */
export const ARENA_RADIUS = 24;

/** `moveCharacter` へ渡す移動範囲。 */
export const ARENA_BOUNDS: CircularBounds = { radius: ARENA_RADIUS };

/** アリーナ上に置くものの位置と向き。 */
export interface ArenaAnchor extends PlanarPosition {
  /**
   * Y軸回転 (rad)。アリーナ中心を向く。
   * rotationY = 0 が -Z を向く規約は `facingRotationY` と共通
   * (src/game/movement/movement.ts)。
   */
  rotationY: number;
}

/**
 * 原点を向く Y軸回転。
 *
 * -Z を正面とするモデルを、`angle` の位置から中心へ向ける。
 * `facingRotationY` と同じ規約であることは arena.test.ts で固定している。
 */
function facingCenterRotationY(angle: number): number {
  return Math.atan2(Math.cos(angle), Math.sin(angle));
}

function toAnchor(point: RingPoint): ArenaAnchor {
  return { x: point.x, z: point.z, rotationY: facingCenterRotationY(point.angle) };
}

function anchorOnRing(angle: number, radius: number): ArenaAnchor {
  return toAnchor({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle });
}

/** 堀大輔の立ち位置。中央 (docs/phase2-gameplay-spec.md §2「マップをギミックの一部に使う」)。 */
export const BOSS_ANCHOR: PlanarPosition = { x: 0, z: 0 };

/**
 * 3人のスポーン地点。
 *
 * 全員を +Z 側へ横並びに置く。`facingRotationY` の規約では rotationY = 0 が
 * -Z 向きなので、初期回転を与えなくても3人ともボスの方を向く。
 * 横並びにしているのは、3人が「まず合流している状態から散る」導入にするため
 * (docs/phase2-gameplay-spec.md §3 のコアループ冒頭)。
 *
 * タプルにしてあるのは、3人固定であることを型で表し、`[0]` が
 * `undefined` にならないようにするため (`noUncheckedIndexedAccess`)。
 */
export const SPAWN_POINTS: readonly [PlanarPosition, PlanarPosition, PlanarPosition] = [
  { x: -4, z: 18 },
  { x: 0, z: 18 },
  { x: 4, z: 18 },
];

/** 装置を並べる半径。ボスから離れており、走って向かう必要がある距離。 */
const DEVICE_RING_RADIUS = 17;

/**
 * ショートスリーパー結界の装置 (docs/phase2-gameplay-spec.md §11.1)。
 *
 * 位置そのものがゲームの意味を持つので `angleJitter: 0` で等間隔に置く。
 * 隣の装置までは約29ユニット (移動速度4で約7秒)。
 */
export const DEVICE_ANCHORS: readonly ArenaAnchor[] = ringLayout({
  count: 3,
  innerRadius: DEVICE_RING_RADIUS,
  outerRadius: DEVICE_RING_RADIUS,
  angleJitter: 0,
}).map(toAnchor);

/** 安全地帯を並べる半径。装置より内側で、中央から短時間で退避できる距離。 */
const SAFE_ZONE_RING_RADIUS = 11;

/** 安全地帯1つの半径。中に入っていれば睡眠時間圧縮フィールドを避けられる想定。 */
export const SAFE_ZONE_RADIUS = 3.5;

/**
 * 睡眠時間圧縮フィールドの退避先 (docs/phase2-gameplay-spec.md §9.3)。
 *
 * 装置と同じ角度に重ねると片側だけが混み合うため、`angleOffset` で
 * 60度ずらして互い違いに並べる。
 */
export const SAFE_ZONE_ANCHORS: readonly ArenaAnchor[] = ringLayout({
  count: 3,
  innerRadius: SAFE_ZONE_RING_RADIUS,
  outerRadius: SAFE_ZONE_RING_RADIUS,
  angleOffset: Math.PI / 3,
  angleJitter: 0,
}).map(toAnchor);

/**
 * 伝説のオカリナの祭壇 (docs/phase2-gameplay-spec.md §13)。
 *
 * ボスを挟んでスポーン地点の反対側に1つ置き、最終フェーズで
 * 「奥へ向かう」動線を作る。
 */
export const ALTAR_ANCHOR: ArenaAnchor = anchorOnRing(-Math.PI / 2, 20);
