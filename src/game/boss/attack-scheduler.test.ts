import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HORI_ATTACKS,
  HORI_ATTACK_INTERVAL_MS,
  NEUTRAL_MODIFIERS,
  OVERDRIVE_MODIFIERS,
} from '../config/phase2-boss-balance';
import { attackIntervalMs, phaseAt, scaleTiming } from './attack-scheduler';

describe('技1回の進行', () => {
  const timing = scaleTiming('WAKE_UP_ALARM', NEUTRAL_MODIFIERS);

  it('予兆 → 判定 → 硬直 の順に進む', () => {
    expect(phaseAt(0, timing)).toBe('TELEGRAPH');
    expect(phaseAt(timing.telegraphMs, timing)).toBe('ACTIVE');
    expect(phaseAt(timing.telegraphMs + timing.activeMs, timing)).toBe('RECOVER');
  });

  it('硬直が明けると技が終わる', () => {
    const total = timing.telegraphMs + timing.activeMs + timing.recoverMs;
    expect(phaseAt(total - 1, timing)).toBe('RECOVER');
    expect(phaseAt(total, timing)).toBe('DONE');
  });
});

describe('カフェイン・オーバードライブの高速化', () => {
  it('予兆が短くなる', () => {
    const normal = scaleTiming('BLUE_LIGHT', NEUTRAL_MODIFIERS);
    const fast = scaleTiming('BLUE_LIGHT', OVERDRIVE_MODIFIERS);
    expect(fast.telegraphMs).toBeLessThan(normal.telegraphMs);
  });

  it('硬直と技間インターバルが短くなり、攻撃が途切れなくなる', () => {
    const normal = scaleTiming('MORNING_DASH', NEUTRAL_MODIFIERS);
    const fast = scaleTiming('MORNING_DASH', OVERDRIVE_MODIFIERS);
    expect(fast.recoverMs).toBeLessThan(normal.recoverMs);
    expect(attackIntervalMs(OVERDRIVE_MODIFIERS)).toBeLessThan(HORI_ATTACK_INTERVAL_MS);
  });

  it('判定が出ている尺は縮めない', () => {
    // ここまで縮めると「当たり判定はあったが見えなかった」になる。
    // 高速化しても、危険範囲が読める時間は残す。
    for (const attackId of ['WAKE_UP_ALARM', 'BLUE_LIGHT', 'MORNING_DASH'] as const) {
      expect(scaleTiming(attackId, OVERDRIVE_MODIFIERS).activeMs).toBe(
        DEFAULT_HORI_ATTACKS[attackId].activeMs,
      );
    }
  });

  it('素の状態では数値が設定のままになる', () => {
    const spec = DEFAULT_HORI_ATTACKS.COMPRESSION_FIELD;
    const timing = scaleTiming('COMPRESSION_FIELD', NEUTRAL_MODIFIERS);
    expect(timing).toEqual({
      telegraphMs: spec.telegraphMs,
      activeMs: spec.activeMs,
      recoverMs: spec.recoverMs,
      damage: spec.damage,
    });
  });
});
