import type { HandObservation, MarkerObservation, OraMoveAction, OraRecognition } from './types';

export interface OraGestureRecognizerOptions {
  moveLeftEnter?: number;
  moveLeftRelease?: number;
  moveRightEnter?: number;
  moveRightRelease?: number;
  attackMinSpeed?: number;
  attackCooldownMs?: number;
  oraMaxY?: number;
  oraMinSpread?: number;
  oraHoldMs?: number;
  oraCooldownMs?: number;
}

const defaults: Required<OraGestureRecognizerOptions> = {
  moveLeftEnter: 0.42,
  moveLeftRelease: 0.48,
  moveRightEnter: 0.58,
  moveRightRelease: 0.52,
  // 640px幅・30fpsで約3px/frameの移動。認識を失うほど振らなくても
  // ATTACKを試せる閾値にし、モーションブラーとのトレードオフを避ける。
  attackMinSpeed: 0.35,
  attackCooldownMs: 500,
  oraMaxY: 0.35,
  oraMinSpread: 0.25,
  oraHoldMs: 1000,
  oraCooldownMs: 2000,
};

/** 純粋な観測値からジェスチャーを判定する。ゲームやWeb APIへは依存しない。 */
export function createOraGestureRecognizer(options: OraGestureRecognizerOptions = {}) {
  const config = { ...defaults, ...options };
  let move: OraMoveAction | null = null;
  let attackArmed = true;
  let lastAttackAt = Number.NEGATIVE_INFINITY;
  let oraPoseStartedAt: number | undefined;
  let oraPoseConsumed = false;
  let lastOraAt = Number.NEGATIVE_INFINITY;

  function resetForLostMarker(): void {
    move = null;
    attackArmed = true;
    oraPoseStartedAt = undefined;
    oraPoseConsumed = false;
  }

  return {
    recognize(
      observation: MarkerObservation,
      hand: HandObservation = { capturedAt: observation.capturedAt },
    ): OraRecognition {
      const actions: Array<'ATTACK' | 'ORA_ACTION'> = [];
      const { left, right, capturedAt } = observation;

      const handSpeed = hand.right ? Math.hypot(hand.right.velocityX, hand.right.velocityY) : 0;
      if (handSpeed < config.attackMinSpeed * 0.5) attackArmed = true;
      if (
        hand.right &&
        attackArmed &&
        handSpeed >= config.attackMinSpeed &&
        hand.capturedAt - lastAttackAt >= config.attackCooldownMs
      ) {
        actions.push('ATTACK');
        attackArmed = false;
        lastAttackAt = hand.capturedAt;
      }

      if (!left || !right) {
        move = null;
        oraPoseStartedAt = undefined;
        oraPoseConsumed = false;
        return {
          move,
          actions,
          attackReady: Boolean(hand.right && attackArmed),
          oraPoseProgress: 0,
        };
      }

      const centerX = (left.x + right.x) / 2;
      if (move === 'MOVE_LEFT' && centerX >= config.moveLeftRelease) move = null;
      if (move === 'MOVE_RIGHT' && centerX <= config.moveRightRelease) move = null;
      if (!move && centerX <= config.moveLeftEnter) move = 'MOVE_LEFT';
      if (!move && centerX >= config.moveRightEnter) move = 'MOVE_RIGHT';

      const isOraPose =
        left.y <= config.oraMaxY &&
        right.y <= config.oraMaxY &&
        Math.abs(left.x - right.x) >= config.oraMinSpread;
      if (!isOraPose) {
        oraPoseStartedAt = undefined;
        oraPoseConsumed = false;
      } else if (oraPoseStartedAt === undefined) {
        oraPoseStartedAt = capturedAt;
      }

      const oraPoseProgress =
        oraPoseStartedAt === undefined
          ? 0
          : Math.min(1, (capturedAt - oraPoseStartedAt) / config.oraHoldMs);
      if (
        oraPoseProgress === 1 &&
        !oraPoseConsumed &&
        capturedAt - lastOraAt >= config.oraCooldownMs
      ) {
        actions.push('ORA_ACTION');
        oraPoseConsumed = true;
        lastOraAt = capturedAt;
      }

      return { move, actions, attackReady: Boolean(hand.right && attackArmed), oraPoseProgress };
    },
    reset: resetForLostMarker,
  };
}

export type OraGestureRecognizer = ReturnType<typeof createOraGestureRecognizer>;
