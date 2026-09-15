import { describe, expect, it } from 'vitest';

import {
  FINALE_STATES,
  isBossAiLockedByFinale,
  isFinaleInputLocked,
  nextFinaleState,
  type FinaleState,
} from './finale-state';

describe('最終決戦の状態遷移', () => {
  it('最終演出を定義した順番に1段階ずつ進める', () => {
    const states: FinaleState[] = [FINALE_STATES[0]];

    for (let index = 1; index < FINALE_STATES.length; index += 1) {
      const current = states[index - 1];
      if (current === undefined) throw new Error('現在のFinale Stateが無い');
      states.push(nextFinaleState(current));
    }

    expect(states).toEqual(FINALE_STATES);
  });

  it('COMPLETEから先へは進まない', () => {
    const result = nextFinaleState('COMPLETE');

    expect(result).toBe('COMPLETE');
  });
});

describe('最終演出中の通常ゲーム操作', () => {
  it.each(FINALE_STATES)('%s のとき、NONE以外では通常操作とBoss AIを止める', (state) => {
    const inputLocked = isFinaleInputLocked(state);
    const bossLocked = isBossAiLockedByFinale(state);

    expect(inputLocked).toBe(state !== 'NONE');
    expect(bossLocked).toBe(state !== 'NONE');
  });
});
