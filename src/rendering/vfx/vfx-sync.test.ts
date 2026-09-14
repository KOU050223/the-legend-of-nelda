import { beforeEach, describe, expect, it } from 'vitest';

import { createFluffyFutonAttack } from '@/game/attacks/fluffy-futon';
import { pillowSweepVisualCue } from '@/game/attacks/pillow-sweep';
import { createGameEventBus } from '@/game/events/game-event';
import { DEFAULT_PRESENTATION_SETTINGS } from '@/presentation/presentation-settings';
import type { PresentationSettings } from '@/presentation/presentation-settings';

import { useVfxStore } from './vfx-store';
import { syncVfxWithGameEvents } from './vfx-sync';

function setup(settings: Partial<PresentationSettings> = {}) {
  const eventBus = createGameEventBus();
  let now = 0;

  const unsubscribe = syncVfxWithGameEvents({
    eventBus,
    now: () => now,
    getSettings: () => ({ ...DEFAULT_PRESENTATION_SETTINGS, ...settings }),
  });

  return {
    eventBus,
    unsubscribe,
    advance: (ms: number) => {
      now += ms;
    },
    activeKinds: () => useVfxStore.getState().active.map((item) => item.kind),
  };
}

beforeEach(() => {
  useVfxStore.setState({ active: [], sequence: 0 });
});

describe('syncVfxWithGameEvents', () => {
  it('イベントを受けると演出が再生中になる', () => {
    const { activeKinds, eventBus } = setup();

    eventBus.emit({ type: 'JUDGED', result: 'JUST_GUARD' });

    expect(activeKinds()).toContain('FLASH');
  });

  it('絵を切ると演出が出ない', () => {
    const { activeKinds, eventBus } = setup({ visualEnabled: false });

    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });
    eventBus.emit({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepVisualCue('LEFT'),
    });

    expect(activeKinds()).toEqual([]);
  });

  it('強度0は絵を切ったのと同じになる', () => {
    const { activeKinds, eventBus } = setup({ visualIntensity: 0 });

    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });

    expect(activeKinds()).toEqual([]);
  });

  it('次の技が始まると前の技の演出が消える', () => {
    // 残すと軌跡や暗転が攻撃フェーズを跨いで見えたままになる。
    const { activeKinds, eventBus } = setup();

    eventBus.emit({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'FLUFFY_FUTON',
      cue: createFluffyFutonAttack({ random: () => 0 }).visualCue!,
    });
    expect(activeKinds()).toContain('DIM');

    eventBus.emit({ type: 'ATTACK_STARTED', attackId: 'PILLOW_SWEEP' });

    expect(activeKinds()).toEqual([]);
  });

  it('Visual Cue の向きが描画側へ届く', () => {
    // 軌跡を左右どちらから描くかの判断材料。枕の軌跡は発動 (ACTIVATION) の
    // 演出なので (レビュー指摘)、ACTIVATION Cue で検証する。
    const { eventBus } = setup();

    eventBus.emit({
      type: 'ATTACK_VISUAL_CUE',
      attackId: 'PILLOW_SWEEP',
      cue: pillowSweepVisualCue('RIGHT'),
      durationMs: 400,
      phase: 'ACTIVATION',
    });

    expect(useVfxStore.getState().active[0]?.cueId).toBe(pillowSweepVisualCue('RIGHT'));
  });

  it('同じ演出が連続しても重ならずに再生し直される', () => {
    const { eventBus } = setup();

    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });
    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });

    const shakes = useVfxStore.getState().active.filter((item) => item.kind === 'SHAKE');
    expect(shakes).toHaveLength(1);
  });

  it('尺を過ぎた演出は消える', () => {
    const { advance, eventBus } = setup();

    eventBus.emit({ type: 'JUDGED', result: 'JUST_GUARD' });
    const { durationMs, startedAt } = useVfxStore.getState().active[0]!;

    advance(durationMs + 1);
    useVfxStore.getState().prune(startedAt + durationMs + 1);

    expect(useVfxStore.getState().active.map((item) => item.kind)).not.toContain('FLASH');
  });

  it('購読を解除するとそれ以降は演出が出ない', () => {
    const { activeKinds, eventBus, unsubscribe } = setup();

    unsubscribe();
    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });

    expect(activeKinds()).toEqual([]);
  });

  it('音を切っても絵は出る', () => {
    const { activeKinds, eventBus } = setup({ audioEnabled: false });

    eventBus.emit({ type: 'COMBAT_STATE_CHANGED', from: 'JUDGE', to: 'HIT' });

    expect(activeKinds()).toContain('SHAKE');
  });
});
