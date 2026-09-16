import { describe, expect, it } from 'vitest';

import {
  ORA_VOICE_DAMAGE_MULTIPLIER_MAX,
  ORA_VOICE_DAMAGE_MULTIPLIER_MIN,
} from '../config/phase2-player-balance';
import { damageMultiplierForIntensity } from './attack-combo';

describe('damageMultiplierForIntensity', () => {
  it('未指定のATTACKは従来どおり倍率補正なしにする', () => {
    expect(damageMultiplierForIntensity(undefined)).toBe(1);
  });

  it('声量を0.85〜1.30倍へ線形変換し、範囲外はクランプする', () => {
    expect(damageMultiplierForIntensity(0)).toBe(ORA_VOICE_DAMAGE_MULTIPLIER_MIN);
    expect(damageMultiplierForIntensity(0.5)).toBeCloseTo(1.075);
    expect(damageMultiplierForIntensity(1)).toBe(ORA_VOICE_DAMAGE_MULTIPLIER_MAX);
    expect(damageMultiplierForIntensity(-1)).toBe(ORA_VOICE_DAMAGE_MULTIPLIER_MIN);
    expect(damageMultiplierForIntensity(2)).toBe(ORA_VOICE_DAMAGE_MULTIPLIER_MAX);
  });
});
