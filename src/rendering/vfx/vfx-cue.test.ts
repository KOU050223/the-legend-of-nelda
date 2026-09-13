import { describe, expect, it } from 'vitest';

import { createFluffyFutonAttack } from '@/game/attacks/fluffy-futon';
import { pillowSweepVisualCue } from '@/game/attacks/pillow-sweep';
import { yawnWave } from '@/game/attacks/yawn-wave';

import { telegraphVfxFor, vfxForEvent, type VfxKind } from './vfx-cue';

/** 技側の実装から Visual Cue ID を取る。文字列を書き写さない。 */
function futonVisualCue(direction: 'LEFT' | 'RIGHT'): string {
  return createFluffyFutonAttack({ random: () => (direction === 'LEFT' ? 0 : 0.9) }).visualCue!;
}

function kindsOf(event: Parameters<typeof vfxForEvent>[0]): VfxKind[] {
  return vfxForEvent(event).map((cue) => cue.kind);
}

describe('telegraphVfxFor', () => {
  it.each([
    ['枕薙ぎ払い (左)', pillowSweepVisualCue('LEFT'), 'SWEEP_TRAIL'],
    ['枕薙ぎ払い (右)', pillowSweepVisualCue('RIGHT'), 'SWEEP_TRAIL'],
    ['あくび衝撃波', yawnWave.visualCue!, 'SHOCKWAVE'],
    ['ふかふか布団 (左)', futonVisualCue('LEFT'), 'DIM'],
    ['ふかふか布団 (右)', futonVisualCue('RIGHT'), 'DIM'],
  ] as const)('%s の Visual Cue に固有の予兆演出がある', (_name, cue, expected) => {
    expect(telegraphVfxFor(cue, 1_000)?.kind).toBe(expected);
  });

  it('3技の予兆演出がすべて異なる', () => {
    const kinds = [pillowSweepVisualCue('LEFT'), yawnWave.visualCue!, futonVisualCue('LEFT')].map(
      (cue) => telegraphVfxFor(cue, 1_000)?.kind,
    );

    expect(new Set(kinds).size).toBe(3);
  });

  it('予兆の尺はイベントから受け取った値をそのまま使う', () => {
    // 尺を演出側で持つとバランス調整とずれる (game-event.ts)。
    expect(telegraphVfxFor(pillowSweepVisualCue('LEFT'), 1_300)?.durationMs).toBe(1_300);
  });
});

describe('vfxForEvent', () => {
  it('回避成功は軽いヒットストップになる', () => {
    expect(kindsOf({ type: 'JUDGED', result: 'PERFECT_DODGE' })).toEqual(['HIT_STOP']);
  });

  it('ガード成功はフラッシュで分かる', () => {
    expect(kindsOf({ type: 'JUDGED', result: 'JUST_GUARD' })).toContain('FLASH');
  });

  it.each(['HIT', 'MISS'] as const)('被弾 (%s) はカメラシェイクで分かる', (result) => {
    expect(kindsOf({ type: 'JUDGED', result })).toEqual(['SHAKE']);
  });

  it('被弾のシェイクはガード成功より強い', () => {
    const hit = vfxForEvent({ type: 'JUDGED', result: 'HIT' })[0]!;
    const guard = vfxForEvent({ type: 'JUDGED', result: 'JUST_GUARD' }).find(
      (cue) => cue.kind === 'SHAKE',
    );

    expect(hit.strength).toBeGreaterThan(guard!.strength);
  });

  it('反撃成立は強めのヒットストップになる', () => {
    const cues = vfxForEvent({
      type: 'COMBAT_STATE_CHANGED',
      from: 'COUNTER_WINDOW',
      to: 'DAMAGE',
    });
    const hitStop = cues.find((cue) => cue.kind === 'HIT_STOP');
    const dodgeHitStop = vfxForEvent({ type: 'JUDGED', result: 'PERFECT_DODGE' })[0]!;

    expect(hitStop!.durationMs).toBeGreaterThan(dodgeHitStop.durationMs);
  });

  it('大ダウンに専用の演出がある', () => {
    expect(kindsOf({ type: 'COMBAT_STATE_CHANGED', from: 'DAMAGE', to: 'BOSS_DOWN' })).not.toEqual(
      [],
    );
  });

  it('早押しで弾かれた入力は被弾演出を出さない', () => {
    expect(kindsOf({ type: 'JUDGED', result: 'TOO_EARLY' })).toEqual([]);
  });

  it('Audio Cue では絵を出さない', () => {
    // 視覚と聴覚は別レイヤー。
    expect(
      kindsOf({ type: 'ATTACK_AUDIO_CUE', attackId: 'PILLOW_SWEEP', cue: 'pillow-swing-left' }),
    ).toEqual([]);
  });

  it('HPの変化そのものは演出を持たない', () => {
    // ゲージの増減は HUD の担当。VFX が二重に反応しない。
    expect(kindsOf({ type: 'BOSS_HP_CHANGED', hp: 40 })).toEqual([]);
  });
});
