import type { WasshoiEvent } from './types';

export interface WasshoiPlaybackParameters {
  gain: number;
  phraseDurationMs: number;
  /** Long utterances are held longer; the pitch is deliberately independent of speech content. */
  playbackRate: number;
}

/**
 * Maps only the non-verbal parts of an utterance to a system-owned Wasshoi phrase.
 * Keeping this pure makes the event suitable for future network playback too.
 */
export function toWasshoiPlaybackParameters(event: WasshoiEvent): WasshoiPlaybackParameters {
  const intensity = Math.min(1, Math.max(0, event.intensity));
  const durationMs = Math.max(0, event.durationMs);
  const phraseDurationMs = Math.min(1_800, Math.max(420, 420 + durationMs * 0.55));

  return {
    gain: 0.08 + intensity * 0.42,
    phraseDurationMs,
    playbackRate: 1_000 / phraseDurationMs,
  };
}

/**
 * A small, app-owned four-syllable Web Audio phrase. It never records, decodes, or
 * plays microphone data. The rising final note gives the generated cue a recognizable
 * "wa-ssho-i" rhythm without requiring a bundled third-party voice recording.
 */
export async function playSystemWasshoi(
  context: AudioContext,
  event: WasshoiEvent,
): Promise<boolean> {
  try {
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') return false;

    const { gain, phraseDurationMs } = toWasshoiPlaybackParameters(event);
    const startedAt = context.currentTime;
    const phraseSeconds = phraseDurationMs / 1_000;
    const syllables = [
      { start: 0, end: 0.23, frequency: 196 },
      { start: 0.23, end: 0.48, frequency: 233 },
      { start: 0.48, end: 0.72, frequency: 262 },
      { start: 0.72, end: 1, frequency: 330 },
    ];
    const master = context.createGain();
    master.gain.setValueAtTime(gain, startedAt);
    master.connect(context.destination);

    syllables.forEach(({ start, end, frequency }) => {
      const oscillator = context.createOscillator();
      const syllableGain = context.createGain();
      const syllableStart = startedAt + phraseSeconds * start;
      const syllableEnd = startedAt + phraseSeconds * end;
      const attackEnd = Math.min(syllableEnd, syllableStart + 0.025);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, syllableStart);
      oscillator.frequency.linearRampToValueAtTime(frequency * 1.03, syllableEnd);
      syllableGain.gain.setValueAtTime(0.0001, syllableStart);
      syllableGain.gain.exponentialRampToValueAtTime(1, attackEnd);
      syllableGain.gain.exponentialRampToValueAtTime(0.0001, syllableEnd);
      oscillator.connect(syllableGain);
      syllableGain.connect(master);
      oscillator.start(syllableStart);
      oscillator.stop(syllableEnd);
    });
    return true;
  } catch (error) {
    console.error('システムわっしょーいの再生に失敗', error);
    return false;
  }
}
