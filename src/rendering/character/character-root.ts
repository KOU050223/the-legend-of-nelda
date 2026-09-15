import { MathUtils, type Group } from 'three';

import type { PlanarPosition } from '@/game/movement/types';
import type { PlayerSnapshot } from '@/game/player/player-state';

/**
 * バーを含むプレイヤー表示のルートへ、最新のゲーム座標を反映する。
 *
 * CharacterActor と同じファイルに置くと Fast Refresh が
 * コンポーネント以外の export を理由に状態を保てなくなるため、
 * React を含まないこの関数だけを分けている。
 */
export function syncCharacterRoot(
  root: Group,
  player: Pick<PlayerSnapshot, 'position' | 'rotationY'>,
): void {
  root.position.set(player.position.x, 0, player.position.z);
  root.rotation.set(0, player.rotationY, 0);
}

/**
 * 指数減衰で位置・向きを目標へ寄せるための係数。
 *
 * lambda と deltaSeconds はどちらも number で、積 (lambda * deltaSeconds)
 * にしか効かないため、位置引数のまま並べると入れ替え事故がテストでも
 * 検出できない。名前付きの1オブジェクトにして事故を型で防ぐ。
 */
export interface SmoothingOptions {
  /** 大きいほど速く目標へ追従する。 */
  readonly lambda: number;
  readonly deltaSeconds: number;
  /**
   * 目標との距離がこれを超えたら減衰させず直接 set する。
   *
   * これが無いと、新規マウント直後(原点始まり)や再接続直後の大きな位置差
   * まで滑ってしまう。回避 (dodge) やボスの高速突進のような「本来は瞬間的
   * / 高速に見えるべき移動」も緩慢な滑りに変わってしまい、危険範囲の予兆
   * (真の座標で描く targets/DangerZoneMarks) とキャラの見た目がずれる時間が
   * 伸びる。通常移動の1STATE間隔ぶんの移動量より大きく、回避や突進の
   * 1フレームあたりの移動量より小さい値にすることで、通常移動だけを
   * 滑らかにし、意図的な大移動はそのまま瞬時に見せる。
   */
  readonly snapDistance: number;
}

/** 位置(x/z)だけを指数減衰で目標へ寄せる。ボス・プレイヤー共通で使う。 */
export function dampPlanarPosition(
  root: Pick<Group, 'position'>,
  target: PlanarPosition,
  options: SmoothingOptions,
): void {
  const { lambda, deltaSeconds, snapDistance } = options;
  const dx = target.x - root.position.x;
  const dz = target.z - root.position.z;
  if (Math.hypot(dx, dz) > snapDistance) {
    root.position.x = target.x;
    root.position.z = target.z;
    return;
  }
  root.position.x = MathUtils.damp(root.position.x, target.x, lambda, deltaSeconds);
  root.position.z = MathUtils.damp(root.position.z, target.z, lambda, deltaSeconds);
}

/**
 * syncCharacterRoot の指数減衰版。
 *
 * リモート対戦ではSTATEがサーバー側の一定間隔でしか届かない
 * (server/index.ts の stateBroadcastIntervalMs)。毎フレーム
 * syncCharacterRoot で直接 set すると、STATEが届いた瞬間だけ位置が
 * 飛んで見え、その間は止まって見える(移動中の画面カクツキ, #127)。
 * 前フレームの描画値から指数減衰で目標へ寄せることで、STATEの間隔を
 * またいでも連続した移動に見せる。
 *
 * 判定(当たり判定・危険範囲の予兆)は常に真の snapshot 座標で行われ、
 * このずらしは表示にしか効かない。移動中は見た目が真の位置より
 * 常にわずかに(speed / lambda 相当)遅れる, 静止すれば数フレームで
 * 追いつく。取り違えないよう明示しておく。
 */
export function dampCharacterRoot(
  root: Group,
  player: Pick<PlayerSnapshot, 'position' | 'rotationY'>,
  options: SmoothingOptions,
): void {
  dampPlanarPosition(root, player.position, options);
  root.position.y = 0;
  root.rotation.y = dampAngle(
    root.rotation.y,
    player.rotationY,
    options.lambda,
    options.deltaSeconds,
  );
}

/** 角度の指数減衰。±πをまたぐ向き反転で遠回りしないよう、最短方向へ寄せる。 */
function dampAngle(current: number, target: number, lambda: number, deltaSeconds: number): number {
  const twoPi = Math.PI * 2;
  let shortestDelta = (target - current) % twoPi;
  if (shortestDelta > Math.PI) shortestDelta -= twoPi;
  if (shortestDelta < -Math.PI) shortestDelta += twoPi;
  return current + MathUtils.damp(0, shortestDelta, lambda, deltaSeconds);
}
