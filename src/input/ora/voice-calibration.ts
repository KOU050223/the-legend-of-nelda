import { createVoiceActivityDetector } from '../wasshoi/voice-activity-detector';
import { DEFAULT_VOICE_ACTIVITY_CONFIG, type VoiceActivityConfig } from '../wasshoi/types';

export interface VoiceBaselineCalibrator {
  observeRms(rms: number, now: number): void;
  isComplete(): boolean;
  getBaselineIntensity(): number | undefined;
  reset(): void;
}

/** 既存VADが切り出した最初の発話イベントから、基準音量だけを確定する。 */
export function createVoiceBaselineCalibrator(
  config: Partial<VoiceActivityConfig> = {},
): VoiceBaselineCalibrator {
  const detector = createVoiceActivityDetector({ ...DEFAULT_VOICE_ACTIVITY_CONFIG, ...config });
  let baselineIntensity: number | undefined;

  return {
    observeRms(rms, now) {
      if (baselineIntensity !== undefined) return;

      const event = detector.update(rms, now);
      if (event) baselineIntensity = event.intensity;
    },
    isComplete: () => baselineIntensity !== undefined,
    getBaselineIntensity: () => baselineIntensity,
    reset() {
      detector.reset();
      baselineIntensity = undefined;
    },
  };
}
