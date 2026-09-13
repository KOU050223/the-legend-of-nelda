import { beforeEach, describe, expect, it } from 'vitest';

import { createSilentAudioOutput } from '@/audio/audio-output';
import { createFakeClock } from '@/game/clock';
import type { GameEvent } from '@/game/events/game-event';
import { usePresentationStore } from '@/presentation/presentation-store';
import { DEFAULT_PRESENTATION_SETTINGS } from '@/presentation/presentation-settings';
import { useVfxStore } from '@/rendering/vfx/vfx-store';
import { useGameStore } from '@/store/game-store';

import { createCombatSession, type FrameLoop } from './combat-session';

/**
 * Issue #11 完了条件
 * 「Visual Cue / Audio Cue を個別に無効化してもゲームロジックが壊れない」。
 *
 * 演出設定は Presentation 層だけの値で、Game Logic は参照しない。
 * これを守れているかは「設定を変えて同じ操作をしたとき、流れるイベント列が
 * 完全に一致するか」で確かめられる。イベント列には State 遷移・判定結果・
 * HP・SLEEPINESS がすべて含まれるため。
 */

function createManualLoop(): { loop: FrameLoop; tick: () => void } {
  let onFrame: (() => void) | null = null;

  return {
    loop: (frame) => {
      onFrame = frame;
      return () => {
        onFrame = null;
      };
    },
    tick: () => onFrame?.(),
  };
}

/** 一定の手順で戦闘を進め、流れたイベントを全部集める。 */
function runBattle(): GameEvent[] {
  const clock = createFakeClock();
  const { loop, tick } = createManualLoop();
  const events: GameEvent[] = [];

  const session = createCombatSession({
    clock,
    frameLoop: loop,
    random: () => 0,
    audioOutput: createSilentAudioOutput(),
  });
  session.eventBus.subscribe((event) => events.push(event));

  const advance = (ms: number) => {
    clock.advance(ms);
    tick();
  };

  // INTRO を抜けてから、予兆・回避・反撃・被弾がひととおり出るまで回す。
  advance(3_000);
  for (let step = 0; step < 60; step += 1) {
    advance(100);
    if (step % 7 === 3) session.submitAction('DODGE_LEFT');
    if (step % 11 === 5) session.submitAction('ATTACK');
    if (step % 13 === 9) session.submitAction('GUARD');
  }

  session.dispose();
  return events;
}

function resetStores(): void {
  usePresentationStore.setState(DEFAULT_PRESENTATION_SETTINGS);
  useVfxStore.setState({ active: [], sequence: 0 });
  useGameStore.setState({ eventFeedback: null, eventSequence: 0, lastAttackId: null });
}

describe('演出設定とゲームロジックの独立', () => {
  beforeEach(resetStores);

  it('演出を全部切っても戦闘の進行が変わらない', () => {
    const withEffects = runBattle();

    resetStores();
    usePresentationStore.setState({ audioEnabled: false, visualEnabled: false });
    const withoutEffects = runBattle();

    expect(withoutEffects).toEqual(withEffects);
  });

  it('音だけを切っても戦闘の進行が変わらない', () => {
    const withEffects = runBattle();

    resetStores();
    usePresentationStore.setState({ audioEnabled: false });
    const audioOff = runBattle();

    expect(audioOff).toEqual(withEffects);
  });

  it('絵だけを切っても戦闘の進行が変わらない', () => {
    const withEffects = runBattle();

    resetStores();
    usePresentationStore.setState({ visualEnabled: false });
    const visualOff = runBattle();

    expect(visualOff).toEqual(withEffects);
  });

  it('演出強度を上げても戦闘の進行が変わらない', () => {
    const withEffects = runBattle();

    resetStores();
    usePresentationStore.setState({ audioIntensity: 2, visualIntensity: 2 });
    const exaggerated = runBattle();

    expect(exaggerated).toEqual(withEffects);
  });

  it('確かめている戦闘に判定と反撃が実際に含まれている', () => {
    // 上の比較が「何も起きない戦闘」どうしの比較になっていないことの確認。
    const events = runBattle();

    expect(events.some((event) => event.type === 'JUDGED')).toBe(true);
    expect(events.some((event) => event.type === 'ATTACK_VISUAL_CUE')).toBe(true);
    expect(events.some((event) => event.type === 'ATTACK_AUDIO_CUE')).toBe(true);
  });
});
