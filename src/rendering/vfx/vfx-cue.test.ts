import { describe, expect, it } from 'vitest';

import { createFluffyFutonAttack } from '@/game/attacks/fluffy-futon';
import { pillowSweepVisualCue } from '@/game/attacks/pillow-sweep';
import { yawnWave } from '@/game/attacks/yawn-wave';

import { activationVfxFor, telegraphVfxFor, vfxForEvent, type VfxKind } from './vfx-cue';

/** 技側の実装から Visual Cue ID を取る。文字列を書き写さない。 */
function futonVisualCue(direction: 'LEFT' | 'RIGHT'): string {
  return createFluffyFutonAttack({ random: () => (direction === 'LEFT' ? 0 : 0.9) }).visualCue!;
}

function kindsOf(event: Parameters<typeof vfxForEvent>[0]): VfxKind[] {
  return vfxForEvent(event).map((cue) => cue.kind);
}

describe('telegraphVfxFor', () => {
  // 枕の軌跡・あくびの衝撃波そのものは仕様上「発動」区分の演出なので、
  // TELEGRAPH の予兆演出はここでは返さない (発動時の演出は activationVfxFor
  // が別に持つ、下の describe)。ただし枕は構え自体が回避方向の唯一の視覚
  // 情報なので (§6.1、風切りSEは無方向)、軌跡とは別に構えの向きを返す。
  // あくびは構えに方向を持たないが、何も出ないと予兆が絵として無音に
  // 見えるため最小限の演出を返す (レビュー指摘: telegraph visual を消すな)。
  it.each([
    ['枕薙ぎ払い (左)', pillowSweepVisualCue('LEFT'), 'PILLOW_BRACE'],
    ['枕薙ぎ払い (右)', pillowSweepVisualCue('RIGHT'), 'PILLOW_BRACE'],
    ['あくび衝撃波', yawnWave.visualCue!, 'YAWN_WINDUP'],
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
  ] as const)('枕薙ぎ払いは%sに構えたことが絵で分かる', (_name, direction) => {
    // 仕様 §6.1「攻撃方向を視覚的に判断できる」。風切りSEは無方向 (§22) なので、
    // 構えの向きを絵で出さないと TELEGRAPH 中は回避方向が当て推量になる。
    const kinds = kindsOf({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepVisualCue(direction),
      durationMs: 1_300,
    });

    expect(kinds).toContain('PILLOW_BRACE');
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
    expect(telegraphVfxFor(futonVisualCue('LEFT'), 1_300)?.durationMs).toBe(1_300);
  });
});

describe('activationVfxFor', () => {
  it.each([
    ['枕薙ぎ払い (左)', pillowSweepVisualCue('LEFT'), 'SWEEP_TRAIL'],
    ['枕薙ぎ払い (右)', pillowSweepVisualCue('RIGHT'), 'SWEEP_TRAIL'],
    ['あくび衝撃波', yawnWave.visualCue!, 'SHOCKWAVE'],
  ] as const)('%s の Visual Cue に固有の発動演出がある', (_name, cue, expected) => {
    expect(activationVfxFor(cue, 1_000)?.kind).toBe(expected);
  });

  it('布団の Cue には発動演出を割り当てない', () => {
    // 布団は回避判定のみで、枕・あくびのような軌跡/衝撃波の演出を持たない
    // (仕様 §11「発動」区分は回避判定だけ)。
    expect(activationVfxFor(futonVisualCue('LEFT'), 1_000)).toBeNull();
  });

  it('2技の発動演出が異なる', () => {
    const kinds = [pillowSweepVisualCue('LEFT'), yawnWave.visualCue!].map(
      (cue) => activationVfxFor(cue, 1_000)?.kind,
    );

    expect(new Set(kinds).size).toBe(2);
  });

  it('ATTACK Cueが届いたときだけ発動演出を返す', () => {
    // TELEGRAPH の Cue (phase 省略) では発動演出 (SWEEP_TRAIL) を出さない。
    // ATTACK が始まる前に描画すると、実際の swing より早く軌跡が見えてしまう。
    const telegraphKinds = kindsOf({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepVisualCue('LEFT'),
      durationMs: 1_300,
    });
    expect(telegraphKinds).not.toContain('SWEEP_TRAIL');

    const activationKinds = kindsOf({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepVisualCue('LEFT'),
      durationMs: 400,
      phase: 'ACTIVATION',
    });
    expect(activationKinds).toContain('SWEEP_TRAIL');
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

  it('大ダウン中の追撃も反撃成立と同じ手応えの演出が出る', () => {
    // State は BOSS_DOWN のまま進まないため COMBAT_STATE_CHANGED は来ないが、
    // HPは実際に削れているので無演出のままにはできない。
    expect(kindsOf({ type: 'BOSS_DOWN_FOLLOW_UP_HIT' })).toEqual(
      expect.arrayContaining(['HIT_STOP', 'SHAKE']),
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
