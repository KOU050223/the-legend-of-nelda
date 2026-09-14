import { Ground } from './Ground';
import { Grass } from './Grass';
import { Rocks } from './Rocks';
import { Trees } from './Trees';

/** 草原の地面色。Combat側の Ground (暗い戦闘フィールド) とは独立した色。 */
const FIELD_GROUND_COLOR = '#4f7a3a';

export interface WorldProps {
  groundSize?: number;
}

/**
 * 3Dワールドの基盤。簡易ステージとして、Ground + 見た目のランドマーク
 * (木立・岩・草) を持つ。すべて Three.js の標準ジオメトリ + instancedMesh
 * のみで構成し、画像テクスチャやGLBを使わないため軽量。
 *
 * 木立・岩は Ground の縁に沿って配置し、当たり判定は持たないまま
 * 「ここまでがステージ」と視覚的にわかる境界として機能する
 * (Issue #41 は Collision/Physics をスコープ外としているため)。
 *
 * 将来 Map GLB へ差し替えるときも、この Component 境界の内側だけを
 * 変更すればよい状態にする (Issue #41)。
 */
export function World({ groundSize }: WorldProps): React.JSX.Element {
  return (
    <>
      {groundSize === undefined ? (
        <Ground color={FIELD_GROUND_COLOR} />
      ) : (
        <Ground size={groundSize} color={FIELD_GROUND_COLOR} />
      )}
      <Grass />
      <Trees />
      <Rocks />
    </>
  );
}
