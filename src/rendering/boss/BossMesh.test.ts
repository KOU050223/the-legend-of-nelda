import { describe, expect, it } from 'vitest';

import { motionContextForCombatState } from './BossMesh';

describe('旧戦闘のボスモーション条件', () => {
  it('攻撃状態だけ attacking を立てる', () => {
    expect(motionContextForCombatState('ATTACK').attacking).toBe(true);
    expect(motionContextForCombatState('IDLE').attacking).toBe(false);
  });
});
