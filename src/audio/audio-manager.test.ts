import { describe, expect, it, vi } from 'vitest';

import { createFluffyFutonAttack } from '@/game/attacks/fluffy-futon';
import { pillowSweepAudioCue } from '@/game/attacks/pillow-sweep';
import { yawnWave } from '@/game/attacks/yawn-wave';
import { createGameEventBus } from '@/game/events/game-event';
import { DEFAULT_PRESENTATION_SETTINGS } from '@/presentation/presentation-settings';
import type { PresentationSettings } from '@/presentation/presentation-settings';

import type { AudioOutput } from './audio-output';
import { createAudioManager, soundForEvent } from './audio-manager';
import type { SoundId } from './sound-manifest';

function createSpyOutput(): AudioOutput & {
  played: Array<{ soundId: SoundId; volume: number }>;
  disposeSpy: ReturnType<typeof vi.fn<() => void>>;
} {
  const played: Array<{ soundId: SoundId; volume: number }> = [];
  const disposeSpy = vi.fn<() => void>();

  return {
    played,
    disposeSpy,
    play: (soundId, volume) => played.push({ soundId, volume }),
    dispose: () => disposeSpy(),
  };
}

describe('soundForEvent', () => {
  // Cue ID は技側の実装から取る。文字列を書き写すと、技が Cue ID を変えても
  // テストが通ってしまい「音が鳴らない」ことに気づけない。
  const attackAudioCues = [
    ['枕薙ぎ払い (左)', pillowSweepAudioCue('LEFT')],
    ['枕薙ぎ払い (右)', pillowSweepAudioCue('RIGHT')],
    ['あくび衝撃波', yawnWave.audioCue!],
    ['ふかふか布団', createFluffyFutonAttack({ random: () => 0 }).audioCue!],
  ] as const;

  it.each(attackAudioCues)('%s の Audio Cue にSEが割り当たっている', (_name, cue) => {
    expect(
      soundForEvent({ type: 'ATTACK_AUDIO_CUE', attackId: 'PILLOW_SWEEP', cue }),
    ).not.toBeNull();
  });

  it('3技の予兆SEがすべて異なる', () => {
    const cues = [
      pillowSweepAudioCue('LEFT'),
      yawnWave.audioCue!,
      createFluffyFutonAttack({ random: () => 0 }).audioCue!,
    ];
    const sounds = cues.map((cue) =>
      soundForEvent({ type: 'ATTACK_AUDIO_CUE', attackId: 'PILLOW_SWEEP', cue }),
    );

    expect(new Set(sounds).size).toBe(cues.length);
  });

  it('枕は左右どちらから来ても同じ風切り音になる', () => {
    const left = soundForEvent({
      type: 'ATTACK_AUDIO_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepAudioCue('LEFT'),
    });
    const right = soundForEvent({
      type: 'ATTACK_AUDIO_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepAudioCue('RIGHT'),
    });

    expect(left).toBe(right);
    expect(left).not.toBeNull();
  });

  it.each([
    ['PERFECT_DODGE', 'dodge-success'],
    ['JUST_GUARD', 'guard-success'],
    ['HIT', 'hit-impact'],
    ['MISS', 'hit-impact'],
  ] as const)('判定 %s が音で分かる', (result, expected) => {
    expect(soundForEvent({ type: 'JUDGED', result })).toBe(expected);
  });

  it('早押しで弾かれた入力は被弾SEを鳴らさない', () => {
    // 当たっていないので、被弾と同じ音にすると結果を取り違える。
    expect(soundForEvent({ type: 'JUDGED', result: 'TOO_EARLY' })).toBeNull();
  });

  it('反撃の成立が音で分かる', () => {
    expect(
      soundForEvent({ type: 'COMBAT_STATE_CHANGED', from: 'COUNTER_WINDOW', to: 'DAMAGE' }),
    ).toBe('counter-success');
  });

  it('大ダウンに専用のSEがある', () => {
    expect(soundForEvent({ type: 'COMBAT_STATE_CHANGED', from: 'DAMAGE', to: 'BOSS_DOWN' })).toBe(
      'boss-down',
    );
  });

  it('Visual Cue では音を鳴らさない', () => {
    // 視覚と聴覚は別レイヤー。片方の購読者へもう片方の情報を渡さない。
    expect(
      soundForEvent({
        type: 'ATTACK_VISUAL_CUE',
        attackId: 'PILLOW_SWEEP',
        cue: pillowSweepAudioCue('LEFT'),
      }),
    ).toBeNull();
  });
});

describe('createAudioManager', () => {
  function setup(settings: Partial<PresentationSettings> = {}) {
    const eventBus = createGameEventBus();
    const output = createSpyOutput();
    const dispose = createAudioManager({
      eventBus,
      output,
      getSettings: () => ({ ...DEFAULT_PRESENTATION_SETTINGS, ...settings }),
    });

    return { dispose, eventBus, output };
  }

  it('イベントを受けるとSEが鳴る', () => {
    const { eventBus, output } = setup();

    eventBus.emit({ type: 'JUDGED', result: 'PERFECT_DODGE' });

    expect(output.played).toEqual([{ soundId: 'dodge-success', volume: 1 }]);
  });

  it('音を切ると何も鳴らない', () => {
    const { eventBus, output } = setup({ audioEnabled: false });

    eventBus.emit({ type: 'JUDGED', result: 'HIT' });
    eventBus.emit({ type: 'ATTACK_AUDIO_CUE', attackId: 'YAWN_WAVE', cue: yawnWave.audioCue! });

    expect(output.played).toEqual([]);
  });

  it('音量の設定が再生音量へ効く', () => {
    const { eventBus, output } = setup({ audioIntensity: 0.4 });

    eventBus.emit({ type: 'JUDGED', result: 'HIT' });

    expect(output.played).toEqual([{ soundId: 'hit-impact', volume: 0.4 }]);
  });

  it('強度0は音を切ったのと同じになる', () => {
    const { eventBus, output } = setup({ audioIntensity: 0 });

    eventBus.emit({ type: 'JUDGED', result: 'HIT' });

    expect(output.played).toEqual([]);
  });

  it('購読を解除するとそれ以降は鳴らない', () => {
    const { dispose, eventBus, output } = setup();
    const { disposeSpy } = output;

    dispose();
    eventBus.emit({ type: 'JUDGED', result: 'HIT' });

    expect(output.played).toEqual([]);
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('絵を切っても音は鳴る', () => {
    // 見ざる / 聞かざるへの分解の前提。片方を落としてももう片方は届く。
    const { eventBus, output } = setup({ visualEnabled: false });

    eventBus.emit({ type: 'JUDGED', result: 'JUST_GUARD' });

    expect(output.played).toEqual([{ soundId: 'guard-success', volume: 1 }]);
  });
});
