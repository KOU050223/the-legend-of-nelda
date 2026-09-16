export const DEFEAT_CINEMATIC_TIMING = {
  sleep: 0,
  bossReveal: 1_800,
  worldFall: 3_800,
  badEnd: 7_000,
  restart: 9_000,
} as const;

export type DefeatCinematicCut = 'SLEEP' | 'BOSS_REVEAL' | 'WORLD_FALL' | 'BAD_END';

export interface DefeatCinematicState {
  readonly cut: DefeatCinematicCut;
  readonly progress: number;
  readonly darkness: number;
  readonly fog: number;
  readonly caption: string | null;
  readonly showBadEnd: boolean;
  readonly showRestart: boolean;
}

const captions = [
  '全員が、眠ってしまった。',
  '堀大輔の「睡眠改善プログラム」は、世界へ広がった。',
  '人々は眠らなくなり、キレやすく、話を聞かなくなった。',
] as const;

const captionSchedule = [
  { start: DEFEAT_CINEMATIC_TIMING.worldFall, end: 4_700 },
  { start: 5_000, end: 5_900 },
  { start: 6_200, end: DEFEAT_CINEMATIC_TIMING.badEnd },
] as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function progressBetween(elapsedMs: number, startMs: number, endMs: number): number {
  return clamp((elapsedMs - startMs) / (endMs - startMs));
}

function smoothstep(value: number): number {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function captionFor(elapsedMs: number): string | null {
  const captionIndex = captionSchedule.findIndex(
    ({ start, end }) => elapsedMs >= start && elapsedMs < end,
  );
  return captionIndex === -1 ? null : (captions[captionIndex] ?? null);
}

export function getDefeatCinematicState(elapsedMs: number): DefeatCinematicState {
  const elapsed = Math.max(0, elapsedMs);
  const cut: DefeatCinematicCut =
    elapsed < DEFEAT_CINEMATIC_TIMING.bossReveal
      ? 'SLEEP'
      : elapsed < DEFEAT_CINEMATIC_TIMING.worldFall
        ? 'BOSS_REVEAL'
        : elapsed < DEFEAT_CINEMATIC_TIMING.badEnd
          ? 'WORLD_FALL'
          : 'BAD_END';
  const segmentStart =
    cut === 'SLEEP'
      ? DEFEAT_CINEMATIC_TIMING.sleep
      : cut === 'BOSS_REVEAL'
        ? DEFEAT_CINEMATIC_TIMING.bossReveal
        : cut === 'WORLD_FALL'
          ? DEFEAT_CINEMATIC_TIMING.worldFall
          : DEFEAT_CINEMATIC_TIMING.badEnd;
  const segmentEnd =
    cut === 'SLEEP'
      ? DEFEAT_CINEMATIC_TIMING.bossReveal
      : cut === 'BOSS_REVEAL'
        ? DEFEAT_CINEMATIC_TIMING.worldFall
        : cut === 'WORLD_FALL'
          ? DEFEAT_CINEMATIC_TIMING.badEnd
          : DEFEAT_CINEMATIC_TIMING.restart;
  const worldProgress = progressBetween(
    elapsed,
    DEFEAT_CINEMATIC_TIMING.worldFall,
    DEFEAT_CINEMATIC_TIMING.badEnd,
  );

  return {
    cut,
    progress: progressBetween(elapsed, segmentStart, segmentEnd),
    darkness: smoothstep(worldProgress),
    fog: smoothstep(worldProgress) * 0.8,
    caption: captionFor(elapsed),
    showBadEnd: elapsed >= DEFEAT_CINEMATIC_TIMING.badEnd,
    showRestart: elapsed >= DEFEAT_CINEMATIC_TIMING.restart,
  };
}
