export interface GroundProps {
  /** 一辺の長さ。将来 Map GLB に差し替わるまでの仮の広さ。 */
  size?: number;
  color?: string;
}

/**
 * 仮の地面。Graybox First のため単一の Plane で表現する。
 * 将来 Map GLB / environment props / obstacle をここへ追加する (Issue #41)。
 */
export function Ground({ size = 100, color = '#241f33' }: GroundProps): React.JSX.Element {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
