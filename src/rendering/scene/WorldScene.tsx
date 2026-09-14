import { BossArenaScene } from '../boss/BossArenaScene';

/**
 * ワールド。草原に堀大輔が居て、その場で戦う。
 *
 * 戦闘専用の別マップ・別シーンは作らない
 * (docs/phase2-gameplay-spec.md §2「1つの広めのボスマップ」
 * 「マップそのものをボス戦ギミックの一部として利用する」)。探索用と
 * 戦闘用でシーンを分けると、草原の定義が二重になり、片方だけ直して
 * もう片方がずれる。
 *
 * 中身 (World / ボス / プレイヤー / 追従カメラ) は BossArenaScene が持つ。
 * ここは GameScene から呼ばれる入口としてだけ残してある。
 */
export function WorldScene(): React.JSX.Element {
  return <BossArenaScene />;
}
