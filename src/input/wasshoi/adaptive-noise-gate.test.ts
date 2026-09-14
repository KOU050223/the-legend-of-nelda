import { describe, expect, it } from 'vitest';

import { createAdaptiveNoiseGate } from './adaptive-noise-gate';

describe('createAdaptiveNoiseGate', () => {
  it('手動閾値を下回らず、環境ノイズが大きいと閾値を上げる', () => {
    const gate = createAdaptiveNoiseGate(0.008);

    expect(gate.observeSilence(0.002)).toBe(0.008);
    expect(gate.observeSilence(0.04)).toBeGreaterThan(0.008);
    expect(gate.getNoiseFloor()).toBeGreaterThan(0);
  });

  it('閾値の自動引き上げに上限を設ける', () => {
    const gate = createAdaptiveNoiseGate(0.008);

    expect(gate.observeSilence(1)).toBe(0.05);
  });
});
