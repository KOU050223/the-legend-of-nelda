import { PlaceholderCharacter, PLACEHOLDER_CHARACTER_COLOR } from './PlaceholderCharacter';

export interface CharacterModelProps {
  /** 3人を見分けるための色。実Asset導入後はマテリアル差し替えの入口になる。 */
  color?: string;
}

/**
 * キャラクターの見た目を担当する境界。
 *
 * GLB表示・animation・scale調整・model orientation調整はここへ閉じ込める。
 * position / rotation の制御は親の Character Root (PlayerCharacter) が持ち、
 * ここでは受け取らない。
 *
 * 素材待ちの間は PlaceholderCharacter を描画する。実Asset完成後は
 * ここを `useGLTF('/models/player.glb')` を使う実装へ差し替えるだけでよい
 * (Issue #41)。
 */
export function CharacterModel({
  color = PLACEHOLDER_CHARACTER_COLOR,
}: CharacterModelProps): React.JSX.Element {
  return <PlaceholderCharacter color={color} />;
}
