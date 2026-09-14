import { ArenaMarkers } from './ArenaMarkers';
import { Ground } from './Ground';
import { Grass } from './Grass';
import { Rocks } from './Rocks';
import { Trees } from './Trees';
import { GROUND_SIZE } from './stage-layout';

/** 草原の地面色。Combat側の Ground (暗い戦闘フィールド) とは独立した色。 */
const FIELD_GROUND_COLOR = '#4f7a3a';

/**
 * ボスアリーナの3D表現 (Issue #54)。
 *
 * 構成は外側から順に、遠景の木立 → 境界を示す岩の壁 → プレイ可能な床 →
 * 意味のある場所を示すマーカー (ボス位置・装置・安全地帯・祭壇)。
 *
 * 座標と広さの決定は `@/game/arena/arena` が持ち、ここはそれを描くだけにする。
 * 移動の制限も見た目ではなく `moveCharacter` の `bounds` が担う。
 *
 * すべて Three.js の標準ジオメトリ + instancedMesh のみで構成し、画像テクスチャや
 * GLBを使わないため軽量 (Graybox First、docs/technical-design.md §12)。
 * 将来 Map GLB へ差し替えるときも、この Component 境界の内側だけを変更すればよい。
 */
export function World(): React.JSX.Element {
  return (
    <>
      <Ground size={GROUND_SIZE} color={FIELD_GROUND_COLOR} />
      <Grass />
      <Trees />
      <Rocks />
      <ArenaMarkers />
    </>
  );
}
