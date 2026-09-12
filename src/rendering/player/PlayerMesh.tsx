/**
 * 仮Player。Graybox First のため Primitive Mesh で表現する。
 */
export function PlayerMesh(): React.JSX.Element {
  return (
    <mesh position={[0, 0.6, 3.5]} castShadow>
      <capsuleGeometry args={[0.35, 0.7, 4, 12]} />
      <meshStandardMaterial color="#3f8f5f" />
    </mesh>
  );
}
