import { describe, expect, it } from 'vitest';

import { vfxForEvent } from './vfx-cue';
import { hitStopDelta } from './hit-stop';
import type { ActiveVfx } from './vfx-store';

/** イベントが生む演出をそのまま再生中の状態にする。 */
function activeFrom(event: Parameters<typeof vfxForEvent>[0], startedAt = 0): ActiveVfx[] {
  return vfxForEvent(event).map((cue, index) =>
    Object.assign({ startedAt, id: index, cueId: null }, cue),
  );
}

describe('ヒットストップ', () => {
  it('反撃成功でモーションが止まる', () => {
    const active = activeFrom({
      type: 'COMBAT_STATE_CHANGED',
      from: 'COUNTER_WINDOW',
      to: 'DAMAGE',
    });

    expect(hitStopDelta(0.016, active, 0)).toBe(0);
  });

  it('回避成功はモーションを鈍らせるだけで止め切らない', () => {
    // 仕様上「軽いヒットストップ」。反撃成功と同じ止め方にすると差が出ない。
    const active = activeFrom({ type: 'JUDGED', result: 'PERFECT_DODGE' });
    const slowed = hitStopDelta(0.016, active, 0);

    expect(slowed).toBeGreaterThan(0);
    expect(slowed).toBeLessThan(0.016);
  });

  it('反撃成功のほうが回避成功より強く止まる', () => {
    const counter = activeFrom({
      type: 'COMBAT_STATE_CHANGED',
      from: 'COUNTER_WINDOW',
      to: 'DAMAGE',
    });
    const dodge = activeFrom({ type: 'JUDGED', result: 'PERFECT_DODGE' });

    expect(hitStopDelta(0.016, counter, 0)).toBeLessThan(hitStopDelta(0.016, dodge, 0));
  });

  it('尺が過ぎるとモーションが元の速さへ戻る', () => {
    const active = activeFrom({
      type: 'COMBAT_STATE_CHANGED',
      from: 'COUNTER_WINDOW',
      to: 'DAMAGE',
    });
    const { durationMs } = active.find((item) => item.kind === 'HIT_STOP')!;

    expect(hitStopDelta(0.016, active, durationMs)).toBe(0.016);
  });

  it('演出が無いときはモーションに手を加えない', () => {
    expect(hitStopDelta(0.016, [], 0)).toBe(0.016);
  });

  it('被弾ではモーションを止めない', () => {
    // 被弾はカメラシェイクで見せる。止めると反撃成功と区別がつかない。
    const active = activeFrom({ type: 'JUDGED', result: 'HIT' });

    expect(hitStopDelta(0.016, active, 0)).toBe(0.016);
  });
});
