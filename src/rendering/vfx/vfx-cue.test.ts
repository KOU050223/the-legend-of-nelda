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

  it.each([
    ['左', 'LEFT'],
    ['右', 'RIGHT'],
  ] as const)('ふかふか布団は%sに構えたことが絵で分かる', (_name, direction) => {
    // 仕様 §10「布団を右または左に構える / 攻撃方向が分かる」。布団の Audio Cue は
    // 無方向なので、向きを絵で出さないと回避方向が当て推量になる。
    const kinds = kindsOf({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'FLUFFY_FUTON',
      cue: futonVisualCue(direction),
      durationMs: 2_000,
    });

    expect(kinds).toContain('FUTON_BRACE');
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

  it('被弾はカメラシェイクで分かる', () => {
    expect(kindsOf({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' })).toEqual(['SHAKE']);
  });

  it('早押しで弾かれた周回でも被弾すればシェイクが出る', () => {
    // 早押しは JUDGED を発行しないまま HIT State へ進んで眠気ダメージが入る
    // (§13)。JUDGED を発火源にすると、この周回だけ演出なしで被弾する。
    expect(kindsOf({ type: 'INPUT_REJECTED', action: 'GUARD', reason: 'TOO_EARLY' })).toEqual([]);
    expect(kindsOf({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' })).toContain('SHAKE');
  });

  it('被弾のシェイクは1回の被弾につき1つのイベントからしか出ない', () => {
    // JUDGED と State の両方で出すと通常の被弾で二重に走る。
    expect(kindsOf({ type: 'JUDGED', result: 'HIT' })).toEqual([]);
    expect(kindsOf({ type: 'JUDGED', result: 'MISS' })).toEqual([]);
  });

  it('被弾のシェイクはガード成功より強い', () => {
    const hit = vfxForEvent({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' })[0]!;
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
