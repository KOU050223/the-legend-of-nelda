import type { MovementInput } from '@/game/movement/types';

/**
 * 画面基準の移動入力をワールド基準へ変換する。
 *
 * `cameraYaw = 0` は Camera が -Z を向く向き。Game Logic の `MOVE` は
 * forward = -Z / right = +X という既存の契約を保ったまま、入力だけを
 * Camera Space から World Space へ直す。
 */
export function toCameraRelativeMovement(input: MovementInput, cameraYaw: number): MovementInput {
  const { forward, right } = input;
  const cos = Math.cos(cameraYaw);
  const sin = Math.sin(cameraYaw);

  return {
    forward: forward * cos + right * sin,
    right: -forward * sin + right * cos,
  };
}
