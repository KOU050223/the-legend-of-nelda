import { describe, expect, it } from 'vitest';

import {
  advancePhase,
  isBarrierPhase,
  isInvulnerablePhase,
  isOverdrivePhase,
  type BossPhase,
} from './boss-phase';

describe('堀大輔のフェーズ進行', () => {
  it('HPが7割を切るまで導入フェーズのまま', () => {
    expect(advancePhase('INTRO', 1)).toBe('INTRO');
    expect(advancePhase('INTRO', 0.71)).toBe('INTRO');
  });

  it('HPが7割へ到達すると結界①へ入る', () => {
    expect(advancePhase('INTRO', 0.7)).toBe('BARRIER_1');
  });

  it('結界①を解除すると圧縮フィールドが加わるフェーズへ進む', () => {
    expect(advancePhase('BARRIER_1', 0.7)).toBe('FIELD_ADDED');
  });

  it('HPが4割へ到達すると結界②へ入る', () => {
    expect(advancePhase('FIELD_ADDED', 0.4)).toBe('BARRIER_2');
    expect(advancePhase('FIELD_ADDED', 0.41)).toBe('FIELD_ADDED');
  });

  it('結界②を解除するとカフェイン・オーバードライブへ進む', () => {
    expect(advancePhase('BARRIER_2', 0.4)).toBe('OVERDRIVE');
  });

  it('HPが1割へ到達すると NO SLEEP MODE へ進む', () => {
    expect(advancePhase('OVERDRIVE', 0.1)).toBe('NO_SLEEP_MODE');
    expect(advancePhase('OVERDRIVE', 0.11)).toBe('OVERDRIVE');
  });

  it('一撃で複数の境界を跨いでも結界を飛ばさない', () => {
    // 75% から 35% へ一撃で落ちても、結界①を飛ばして結界②へは行かない。
    // 結界は解除しないと先へ進めない関門なので、大ダメージで
    // 協力ギミックをスキップできてはいけない。
    expect(advancePhase('INTRO', 0.35)).toBe('BARRIER_1');
    expect(advancePhase('BARRIER_1', 0.35)).toBe('FIELD_ADDED');
    expect(advancePhase('FIELD_ADDED', 0.35)).toBe('BARRIER_2');
  });

  it('HPが回復してもフェーズは巻き戻らない', () => {
    expect(advancePhase('FIELD_ADDED', 1)).toBe('FIELD_ADDED');
    expect(advancePhase('OVERDRIVE', 0.9)).toBe('OVERDRIVE');
  });

  it('最終フェーズより先へは進まない', () => {
    expect(advancePhase('NO_SLEEP_MODE', 0)).toBe('NO_SLEEP_MODE');
  });
});

describe('フェーズの性質', () => {
  it('結界中と NO SLEEP MODE ではボスにダメージが通らない', () => {
    expect(isInvulnerablePhase('BARRIER_1')).toBe(true);
    expect(isInvulnerablePhase('BARRIER_2')).toBe(true);
    expect(isInvulnerablePhase('NO_SLEEP_MODE')).toBe(true);
  });

  it('通常戦闘のフェーズではダメージが通る', () => {
    const normal: BossPhase[] = ['INTRO', 'FIELD_ADDED', 'OVERDRIVE'];
    for (const phase of normal) {
      expect(isInvulnerablePhase(phase)).toBe(false);
    }
  });

  it('協力ギミックを要求するのは結界フェーズだけ', () => {
    expect(isBarrierPhase('BARRIER_1')).toBe(true);
    expect(isBarrierPhase('BARRIER_2')).toBe(true);
    expect(isBarrierPhase('OVERDRIVE')).toBe(false);
  });

  it('一度オーバードライブへ入ると以降は解除されない', () => {
    expect(isOverdrivePhase('FIELD_ADDED')).toBe(false);
    expect(isOverdrivePhase('BARRIER_2')).toBe(false);
    expect(isOverdrivePhase('OVERDRIVE')).toBe(true);
    expect(isOverdrivePhase('NO_SLEEP_MODE')).toBe(true);
  });
});
