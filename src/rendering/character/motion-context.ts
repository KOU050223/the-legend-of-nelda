import { comboPhaseAt, comboStepAt } from '@/game/player/attack-combo';
import type { PlayerSnapshot } from '@/game/player/player-state';

import { MOTION_CONDITIONS, type MotionContext } from './motion-manifest';

/**
 * プレイヤーの状態から、マニフェストのルールが見る条件を組み立てる。
 *
 * 判定のタイミングはゲームロジックが決め、表示側は状態を読んでモーションを
 * 合わせるだけにする (docs/technical-design.md §13 / attack-combo.ts の方針)。
 * この関数はその「読む」側で、Animation Frame へは触らない。
 *
 * React へ依存しない Pure TypeScript にして、単体でテストできるようにする
 * (docs/technical-design.md §5.1)。
 *
 * @param now 現在時刻 (GameClock の now)。連撃の局面を測るために要る。
 */
export function motionContextFor(player: PlayerSnapshot, now: number): MotionContext {
  return {
    attacking: isSwinging(player, now),
    fallingAsleep: player.status === 'FALLING_ASLEEP',
    asleep: player.status === 'ASLEEP',
  };
}

/**
 * 今まさに振っている最中か。
 *
 * `swing` は振り終わっても連撃の猶予のあいだ残る (player-state.ts)。
 * null かどうかで見ると、攻撃モーションが猶予のあいだ再生され続ける。
 * 局面が `DONE` に入ったら振っていない扱いにする。
 */
function isSwinging(player: PlayerSnapshot, now: number): boolean {
  const { swing } = player;
  if (swing === null) return false;

  const step = comboStepAt(swing.stepIndex);
  return comboPhaseAt(now - swing.startedAt, step) !== 'DONE';
}

/** 2つの条件が同じか。再レンダーが要るかの判定に使う。 */
export function isSameMotionContext(a: MotionContext, b: MotionContext): boolean {
  return MOTION_CONDITIONS.every((condition) => a[condition] === b[condition]);
}
