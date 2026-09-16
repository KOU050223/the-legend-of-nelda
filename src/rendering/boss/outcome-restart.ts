import { DEFEAT_RESULT_TIMING, RESULT_TIMING } from '@/ui/result/result-presentation';

export function isOutcomeRestartAllowed({
  outcome,
  elapsedMs,
}: {
  outcome: 'victory' | 'defeat';
  elapsedMs: number;
}): boolean {
  const restartAt = outcome === 'defeat' ? DEFEAT_RESULT_TIMING.restart : RESULT_TIMING.restart;
  return elapsedMs >= restartAt;
}

/**
 * 戦闘の時間を止めてよいか。
 *
 * `LOCAL_DOWN` (操作キャラが倒れただけ) は**含めない**。勝敗はまだ
 * ついておらず、ここで時間を止めると NPC が起こしに来られない (#158)。
 * ソロでは操作キャラが倒れた瞬間に世界が凍り、蘇生が永久に起きなかった。
 *
 * 操作が戻らないことは入力側で抑えているので、世界は動き続けてよい。
 */
export function isBattleSettled(outcome: 'ONGOING' | 'VICTORY' | 'DEFEAT' | 'LOCAL_DOWN'): boolean {
  return outcome === 'VICTORY' || outcome === 'DEFEAT';
}
