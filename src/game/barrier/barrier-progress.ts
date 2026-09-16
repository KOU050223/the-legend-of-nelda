import type { BarrierChallengeSnapshot } from './barrier-challenge';

/**
 * 連続する2つのスナップショットから「手順を間違えて巻き戻された」ことを読む。
 *
 * `submit()` は `reset: true` を返すが、その戻り値は BossBattle の呼び出し側で
 * 捨てられており、マルチプレイでは判定自体が Authority 側で起きるのでクライアント
 * には届かない。届くのは broadcast される BattleSnapshot だけなので、表示のために
 * 必要な「間違えた」はスナップショットの差分から復元する。
 *
 * 巻き戻しは観測できる: 進行があった状態 (装置を確保済み、または1台以上起動済み)
 * から、同じフェーズのまま全装置 IDLE・nextStepIndex 0 へ戻るのは resetProgress()
 * 以外に無い。結界が張り直された場合はフェーズが変わるので除外できる。
 */
export function didResetProgress(
  previous: BarrierChallengeSnapshot | null,
  next: BarrierChallengeSnapshot | null,
): boolean {
  if (previous === null || next === null) return false;
  // 別の結界 (BARRIER_1 → BARRIER_2) への張り替えは巻き戻しではない。
  if (previous.phase !== next.phase) return false;

  const hadProgress = previous.securedDeviceId !== null || previous.nextStepIndex > 0;
  if (!hadProgress) return false;

  return (
    next.securedDeviceId === null &&
    next.nextStepIndex === 0 &&
    next.devices.every((device) => device.status === 'IDLE')
  );
}
