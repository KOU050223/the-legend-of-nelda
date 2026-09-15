import type { BossPhase } from '@/game/boss/boss-phase';
import type { FinaleState } from '@/game/finale/finale-state';
import type { MicrophoneInputStatus } from '@/input/microphone/types';

export interface FinalePresentationSnapshot {
  readonly phase: BossPhase;
  readonly finale: FinaleState;
  readonly zeroDamageSequence: number;
  readonly microphoneStatus: MicrophoneInputStatus;
}

const INITIAL_SNAPSHOT: FinalePresentationSnapshot = {
  phase: 'INTRO',
  finale: 'NONE',
  zeroDamageSequence: 0,
  microphoneStatus: 'idle',
};

let snapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

export function getFinalePresentationSnapshot(): FinalePresentationSnapshot {
  return snapshot;
}

export function subscribeToFinalePresentation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishFinalePresentation(next: FinalePresentationSnapshot): void {
  if (
    snapshot.phase === next.phase &&
    snapshot.finale === next.finale &&
    snapshot.zeroDamageSequence === next.zeroDamageSequence &&
    snapshot.microphoneStatus === next.microphoneStatus
  )
    return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function resetFinalePresentation(): void {
  publishFinalePresentation(INITIAL_SNAPSHOT);
}
