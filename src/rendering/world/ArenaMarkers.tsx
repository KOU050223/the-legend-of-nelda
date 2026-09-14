import {
  ALTAR_ANCHOR,
  BOSS_ANCHOR,
  DEVICE_ANCHORS,
  SAFE_ZONE_ANCHORS,
  SAFE_ZONE_RADIUS,
  type ArenaAnchor,
} from '@/game/arena/arena';

const SAFE_ZONE_COLOR = '#9fd7ff';
const DEVICE_BASE_COLOR = '#5a5f6b';
const DEVICE_TOP_COLOR = '#ffd166';
const ALTAR_COLOR = '#b9b2a3';
const ALTAR_TOP_COLOR = '#d8c98a';
const BOSS_MARK_COLOR = '#8a2f3c';

/**
 * 地面に貼るマーカーを浮かせる高さ。0 のままだと Ground と Z-fighting する。
 */
const DECAL_Y = 0.02;

/**
 * アリーナ上の「意味のある場所」を示す仮マーカー。
 *
 * 座標は `@/game/arena/arena` が持ち、ここは見た目だけを担当する。
 * 後続Issueが実物へ差し替える:
 * 装置は #59 (ショートスリーパー結界)、安全地帯と危険判定は #58
 * (睡眠時間圧縮フィールド)、祭壇は最終フェーズ。
 *
 * Graybox First (docs/technical-design.md §12) のため Primitive Mesh のみで作る。
 * アリーナ内部にある唯一のランドマークでもあり、走ったときの視差はここから出る。
 */
export function ArenaMarkers(): React.JSX.Element {
  return (
    <>
      <BossMark />
      {SAFE_ZONE_ANCHORS.map((anchor) => (
        <SafeZoneMark key={anchorKey(anchor)} anchor={anchor} />
      ))}
      {DEVICE_ANCHORS.map((anchor) => (
        <DeviceMark key={anchorKey(anchor)} anchor={anchor} />
      ))}
      <AltarMark anchor={ALTAR_ANCHOR} />
    </>
  );
}

function anchorKey(anchor: ArenaAnchor): string {
  return `${anchor.x.toFixed(2)},${anchor.z.toFixed(2)}`;
}

/** 堀大輔の立ち位置。ボス本体は #58 で入るため、今は足元の輪だけを描く。 */
function BossMark(): React.JSX.Element {
  return (
    <mesh
      position={[BOSS_ANCHOR.x, DECAL_Y, BOSS_ANCHOR.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <ringGeometry args={[2.2, 2.8, 32]} />
      <meshStandardMaterial color={BOSS_MARK_COLOR} />
    </mesh>
  );
}

/** 睡眠時間圧縮フィールドの退避先。広さがそのまま安全な範囲を表す。 */
function SafeZoneMark({ anchor }: { anchor: ArenaAnchor }): React.JSX.Element {
  return (
    <mesh position={[anchor.x, DECAL_Y, anchor.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[SAFE_ZONE_RADIUS, 32]} />
      <meshStandardMaterial color={SAFE_ZONE_COLOR} />
    </mesh>
  );
}

/** 結界の装置。中心を向いた小さな柱として置く。 */
function DeviceMark({ anchor }: { anchor: ArenaAnchor }): React.JSX.Element {
  return (
    <group position={[anchor.x, 0, anchor.z]} rotation={[0, anchor.rotationY, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.75, 1.8, 6]} />
        <meshStandardMaterial color={DEVICE_BASE_COLOR} />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color={DEVICE_TOP_COLOR} />
      </mesh>
    </group>
  );
}

/** 伝説のオカリナの祭壇。装置より一回り大きくし、別物だと分かるようにする。 */
function AltarMark({ anchor }: { anchor: ArenaAnchor }): React.JSX.Element {
  return (
    <group position={[anchor.x, 0, anchor.z]} rotation={[0, anchor.rotationY, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.6, 3, 0.6, 8]} />
        <meshStandardMaterial color={ALTAR_COLOR} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.4, 1.2, 1.4]} />
        <meshStandardMaterial color={ALTAR_TOP_COLOR} />
      </mesh>
    </group>
  );
}
