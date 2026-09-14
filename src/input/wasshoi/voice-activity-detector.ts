import type { VoiceActivityConfig, VoiceActivityState, WasshoiEvent } from './types';

export interface VoiceActivityDetector {
  update(rms: number, timestampMs: number): WasshoiEvent | null;
  setThreshold(threshold: number): void;
  getThreshold(): number;
  getState(): VoiceActivityState;
  getDurationMs(timestampMs: number): number;
  getIntensity(): number;
  reset(): WasshoiEvent | null;
}

/** RMSを0〜1の表示・イベント用強度へ寄せる。 */
export function toIntensity(peakRms: number, threshold: number): number {
  if (peakRms <= threshold) return 0;
  return Math.min(1, Math.max(0, (peakRms - threshold) / (1 - threshold)));
}

/**
 * RMSだけで発話区間を切り出す。ここにはWeb AudioやMediaStreamを持ち込まず、
 * マイク・録音・ネットワークのどれからも独立してテストできるようにする。
 */
export function createVoiceActivityDetector(config: VoiceActivityConfig): VoiceActivityDetector {
  let threshold = config.threshold;
  let state: VoiceActivityState = 'silence';
  let startedAtMs: number | null = null;
  let lastVoicedAtMs: number | null = null;
  let peakRms = 0;

  const finish = (endedAtMs: number): WasshoiEvent | null => {
    if (startedAtMs === null) return null;

    const event: WasshoiEvent = {
      type: 'WASSHOI',
      intensity: toIntensity(peakRms, threshold),
      durationMs: Math.max(0, endedAtMs - startedAtMs),
    };
    state = 'silence';
    startedAtMs = null;
    lastVoicedAtMs = null;
    peakRms = 0;
    return event;
  };

  return {
    update(rms, timestampMs) {
      const normalizedRms = Math.max(0, rms);
      const voiced = normalizedRms >= threshold;

      if (state === 'silence') {
        if (!voiced) return null;
        state = 'speaking';
        startedAtMs = timestampMs;
        lastVoicedAtMs = timestampMs;
        peakRms = normalizedRms;
        return null;
      }

      if (voiced) {
        lastVoicedAtMs = timestampMs;
        peakRms = Math.max(peakRms, normalizedRms);
      }

      if (startedAtMs !== null && timestampMs - startedAtMs >= config.maxDurationMs) {
        return finish(timestampMs);
      }

      if (!voiced && lastVoicedAtMs !== null && timestampMs - lastVoicedAtMs >= config.hangoverMs) {
        return finish(lastVoicedAtMs);
      }

      return null;
    },
    getState: () => state,
    setThreshold(nextThreshold) {
      // 発話中に閾値を変えると、発話の途中で切断されうるため次の無音区間まで保留する。
      if (state === 'silence') threshold = Math.max(0, nextThreshold);
    },
    getThreshold: () => threshold,
    getDurationMs(timestampMs) {
      return startedAtMs === null ? 0 : Math.max(0, timestampMs - startedAtMs);
    },
    getIntensity: () => toIntensity(peakRms, threshold),
    reset() {
      const event = state === 'speaking' && lastVoicedAtMs !== null ? finish(lastVoicedAtMs) : null;
      state = 'silence';
      startedAtMs = null;
      lastVoicedAtMs = null;
      peakRms = 0;
      return event;
    },
  };
}
