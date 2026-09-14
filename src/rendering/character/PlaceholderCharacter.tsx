/** 素材が入るまでのキャラクター色。 */
export const PLACEHOLDER_CHARACTER_COLOR = '#3f8f5f';

export interface PlaceholderCharacterProps {
  /** 3人を見分けるための色。 */
  color?: string;
}

/**
 * 素材待ちの間だけ使う仮のキャラクター表示。Graybox First のため
 * Primitive Mesh (capsuleGeometry) で表現する。
 *
 * position / rotation は親の Character Root が持つため、ここでは
 * 原点に置いた見た目だけを担当する。将来ここを
 * `useGLTF('/models/player.glb')` を使う CharacterModel へ差し替える
 * (Issue #41)。
 */
export function PlaceholderCharacter({
  color = PLACEHOLDER_CHARACTER_COLOR,
}: PlaceholderCharacterProps): React.JSX.Element {
  return (
    <mesh position={[0, 0.6, 0]} castShadow>
      <capsuleGeometry args={[0.35, 0.7, 4, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
