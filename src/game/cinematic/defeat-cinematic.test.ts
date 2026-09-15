import { describe, expect, it } from 'vitest';

import { DEFEAT_CINEMATIC_TIMING, getDefeatCinematicState } from './defeat-cinematic';

describe('敗北シネマティック', () => {
  it.each([
    { elapsedMs: 0, cut: 'SLEEP', caption: null },
    { elapsedMs: 2_000, cut: 'BOSS_REVEAL', caption: null },
    { elapsedMs: 4_000, cut: 'WORLD_FALL', caption: '全員が、眠ってしまった。' },
    { elapsedMs: 7_500, cut: 'BAD_END', caption: null },
  ] as const)('$elapsedMs ms では $cut の状態になる', ({ elapsedMs, cut, caption }) => {
    const state = getDefeatCinematicState(elapsedMs);

    expect(state.cut).toBe(cut);
    expect(state.caption).toBe(caption);
  });

  it('終幕では暗転とBAD ENDを表示し、再起動可能になる', () => {
    const state = getDefeatCinematicState(DEFEAT_CINEMATIC_TIMING.restart);

    expect(state.darkness).toBe(1);
    expect(state.showBadEnd).toBe(true);
    expect(state.showRestart).toBe(true);
  });

  it('タイムラインより前の時刻や負の時刻を安全に扱う', () => {
    const state = getDefeatCinematicState(-100);

    expect(state).toMatchObject({ cut: 'SLEEP', progress: 0, darkness: 0, fog: 0 });
  });
});
