import { DEFAULT_REVIVAL } from '@/game/config/phase2-player-balance';
import { requiredReviveInputs, type PlayerSnapshot } from '@/game/player/player-state';

export function reviveProgressLabel(player: PlayerSnapshot): string {
  return `蘇生中 ${player.reviveInputs}/${requiredReviveInputs()}`;
}

export function sleepCountdownSeconds(player: PlayerSnapshot, now: number): number | null {
  if (player.status !== 'FALLING_ASLEEP' || player.sleepAt === null) return null;
  return Math.max(0, (player.sleepAt - now) / 1000);
}

export function sleepCountdownRatio(player: PlayerSnapshot, now: number): number {
  const seconds = sleepCountdownSeconds(player, now);
  if (seconds === null) return 0;
  return Math.min(1, seconds / (DEFAULT_REVIVAL.sleepCountdownMs / 1000));
}
