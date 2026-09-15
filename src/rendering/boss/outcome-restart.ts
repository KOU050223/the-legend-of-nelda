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
