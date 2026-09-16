import { describe, expect, it } from 'vitest';

import { isOutcomeRestartAllowed } from './outcome-restart';

describe('決着後のリトライ入力', () => {
  it('敗北ムービーが終わるまではRキーを受け付けない', () => {
    expect(isOutcomeRestartAllowed({ outcome: 'defeat', elapsedMs: 8_999 })).toBe(false);
  });

  it('BAD END後はRキーを受け付ける', () => {
    expect(isOutcomeRestartAllowed({ outcome: 'defeat', elapsedMs: 9_000 })).toBe(true);
  });
});
