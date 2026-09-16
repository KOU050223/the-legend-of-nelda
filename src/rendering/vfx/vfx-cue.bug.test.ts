import { describe, expect, it } from 'vitest';

import { vfxForEvent } from './vfx-cue';

/** 通常の被弾 (HIT State) の演出。吹き飛びの派手さを比べる基準にする。 */
const NORMAL_HIT = vfxForEvent({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });
const BLOWN_AWAY = vfxForEvent({ type: 'PLAYER_BLOWN_AWAY', attackId: 'FLUFFY_FUTON' });

/**
 * Intentional Bug: 吹き飛びの演出だけが不自然に大げさ
 *
 * ファイナルソード的な「過剰演出」「Hit Stop が長くて止まったと思わせる」への
 * オマージュとして意図的に実装している (Issue #140 / Issue #42)。
 * 通常の不具合として修正しないこと。
 *
 * 眠気ダメージは入っていない (fluffy-futon.bug.test.ts) のに、演出だけは
 * 通常の被弾より派手になる。この「起きたことの大きさと演出の大きさが
 * 釣り合っていない」ズレそのものが #42 の狙い。
 */
describe('Intentional Bug: 吹き飛びは通常の被弾より派手に見せる', () => {
  it('吹き飛びはヒットストップと画面揺れの2つが同時に出る', () => {
    expect(BLOWN_AWAY.map((cue) => cue.kind)).toEqual(['HIT_STOP', 'SHAKE']);
  });

  it('通常の被弾は画面揺れだけで、ヒットストップは出ない', () => {
    expect(NORMAL_HIT.map((cue) => cue.kind)).toEqual(['SHAKE']);
  });

  it('吹き飛びの画面揺れは通常の被弾より長く続く', () => {
    const blownShake = BLOWN_AWAY.find((cue) => cue.kind === 'SHAKE');
    const normalShake = NORMAL_HIT.find((cue) => cue.kind === 'SHAKE');

    expect(blownShake?.durationMs).toBeGreaterThan(normalShake!.durationMs);
  });

  it('吹き飛びのヒットストップは反撃成功より長く、「止まった？」と思う尺にする', () => {
    const counterHitStop = vfxForEvent({
      type: 'COMBAT_STATE_CHANGED',
      from: 'COUNTER_WINDOW',
      to: 'DAMAGE',
    }).find((cue) => cue.kind === 'HIT_STOP');
    const blownHitStop = BLOWN_AWAY.find((cue) => cue.kind === 'HIT_STOP');

    expect(blownHitStop?.durationMs).toBeGreaterThan(counterHitStop!.durationMs);
  });
});
