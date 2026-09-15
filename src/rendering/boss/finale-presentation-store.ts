import type { BossPhase } from '@/game/boss/boss-phase';
import type { FinaleState } from '@/game/finale/finale-state';
import type { MicrophoneInputStatus } from '@/input/microphone/types';
import type { NoteName } from '@/input/microphone/types';

export interface PlayedMelodyNote {
  readonly id: number;
  readonly name: NoteName;
  readonly correct: boolean;
}

export interface FinalePresentationSnapshot {
  readonly phase: BossPhase;
  readonly finale: FinaleState;
  readonly zeroDamageSequence: number;
  readonly microphoneStatus: MicrophoneInputStatus;
  /** 実際にマイクから確定した音だけを、五線譜へ表示する。 */
  readonly playedMelodyNotes: readonly PlayedMelodyNote[];
  /** 同じミス演出を連続して再生するための連番。 */
  readonly melodyMissSequence: number;
  /** 救済表示用。現在プレイヤーに求めている次の音。 */
  readonly melodyExpected: NoteName | null;
  /** 複数ミス、または一定時間無入力時にだけ次音を見せる。 */
  readonly showMelodyHint: boolean;
}

const INITIAL_SNAPSHOT: FinalePresentationSnapshot = {
  phase: 'INTRO',
  finale: 'NONE',
  zeroDamageSequence: 0,
  microphoneStatus: 'idle',
  playedMelodyNotes: [],
  melodyMissSequence: 0,
  melodyExpected: null,
  showMelodyHint: false,
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
    snapshot.microphoneStatus === next.microphoneStatus &&
    snapshot.playedMelodyNotes === next.playedMelodyNotes &&
    snapshot.melodyMissSequence === next.melodyMissSequence &&
    snapshot.melodyExpected === next.melodyExpected &&
    snapshot.showMelodyHint === next.showMelodyHint
  )
    return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function resetFinalePresentation(): void {
  publishFinalePresentation(INITIAL_SNAPSHOT);
}
