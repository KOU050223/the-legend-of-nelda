import type { WasshoiEvent } from './types';

export interface WasshoiPlaybackParameters {
  volume: number;
  /** Long utterances are spoken more slowly. */
  rate: number;
}

/**
 * Maps only the non-verbal parts of an utterance to a system-owned Wasshoi phrase.
 * Keeping this pure makes the event suitable for future network playback too.
 */
export function toWasshoiPlaybackParameters(event: WasshoiEvent): WasshoiPlaybackParameters {
  const intensity = Math.min(1, Math.max(0, event.intensity));
  const durationMs = Math.max(0, event.durationMs);

  return {
    volume: 0.15 + intensity * 0.85,
    rate: Math.min(1.5, Math.max(0.6, 1_300 / Math.max(400, durationMs))),
  };
}

/**
 * A browser-provided Japanese TTS phrase. It never records, decodes, or plays
 * microphone data, and does not rely on a third-party recording bundled with the app.
 */
export function playSystemWasshoi(event: WasshoiEvent): boolean {
  try {
    if (!('speechSynthesis' in window)) return false;
    const { volume, rate } = toWasshoiPlaybackParameters(event);
    const utterance = new SpeechSynthesisUtterance('わっしょーい！');
    utterance.lang = 'ja-JP';
    utterance.volume = volume;
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    console.error('システムわっしょーいTTSの再生に失敗', error);
    return false;
  }
}
