/**
 * Learns only while VAD is silent, so a speaker's voice cannot raise its own
 * threshold. The manual threshold stays the lower bound for predictable tuning.
 */
export interface AdaptiveNoiseGate {
  observeSilence(rms: number): number;
  getNoiseFloor(): number;
  getThreshold(): number;
}

export function createAdaptiveNoiseGate(manualThreshold: number): AdaptiveNoiseGate {
  let noiseFloor = 0;
  let effectiveThreshold = manualThreshold;

  return {
    observeSilence(rms) {
      const normalizedRms = Math.max(0, rms);
      noiseFloor = noiseFloor === 0 ? normalizedRms : noiseFloor * 0.9 + normalizedRms * 0.1;
      effectiveThreshold = Math.max(manualThreshold, Math.min(0.05, noiseFloor * 2.5));
      return effectiveThreshold;
    },
    getNoiseFloor: () => noiseFloor,
    getThreshold: () => effectiveThreshold,
  };
}
