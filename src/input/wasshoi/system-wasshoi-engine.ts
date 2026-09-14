import type { WasshoiEvent } from './types';

export interface WasshoiPlaybackParameters {
  phrase: string;
  volume: number;
  /** Long utterances are spoken more slowly. */
  rate: number;
  /** SpeechSynthesis pitch, kept independent from the player's spoken words. */
  pitch: number;
}

/**
 * Maps only the non-verbal parts of an utterance to a system-owned Wasshoi phrase.
 * Keeping this pure makes the event suitable for future network playback too.
 */
export function toWasshoiPlaybackParameters(
  event: WasshoiEvent,
  variantIndex = 0,
): WasshoiPlaybackParameters {
  const intensity = Math.min(1, Math.max(0, event.intensity));
  const durationMs = Math.max(0, event.durationMs);
  const variant = ((variantIndex % 3) + 3) % 3;
  const pitchOffset = variant === 0 ? -0.18 : variant === 1 ? 0 : 0.18;
  const rateMultiplier = variant === 0 ? 0.92 : variant === 1 ? 1 : 1.08;

  return {
    phrase:
      durationMs >= 1_400
        ? 'わっしょおおおーい！'
        : durationMs < 450
          ? 'わっしょい！'
          : 'わっしょーい！',
    volume: 0.15 + intensity * 0.85,
    rate: Math.min(1.6, Math.max(0.55, 1_300 / Math.max(400, durationMs))) * rateMultiplier,
    pitch: Math.min(1.5, Math.max(0.55, 0.9 + intensity * 0.25 + pitchOffset)),
  };
}

function selectJapaneseVoice(variantIndex: number): SpeechSynthesisVoice | null {
  const japaneseVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith('ja'));
  return japaneseVoices.length === 0
    ? null
    : (japaneseVoices[variantIndex % japaneseVoices.length] ?? null);
}

/**
 * A browser-provided Japanese TTS phrase. It never records, decodes, or plays
 * microphone data, and does not rely on a third-party recording bundled with the app.
 */
export function playSystemWasshoi(event: WasshoiEvent, variantIndex = 0): boolean {
  try {
    if (!('speechSynthesis' in window)) return false;
    const { phrase, volume, rate, pitch } = toWasshoiPlaybackParameters(event, variantIndex);
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'ja-JP';
    utterance.volume = volume;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.voice = selectJapaneseVoice(variantIndex);
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    console.error('システムわっしょーいTTSの再生に失敗', error);
    return false;
  }
}
