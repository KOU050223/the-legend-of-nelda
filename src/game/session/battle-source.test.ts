import { describe, expect, it, vi } from 'vitest';

import { createFakeClock } from '../clock';
import { createGameEventBus } from '../events/game-event';
import { createBossBattle, type BattleSnapshot } from './boss-battle';
import { createLocalBattleSource } from './battle-source';

describe('createLocalBattleSource', () => {
  it('submitをlocalPlayerId付きで委譲し、tickのupdate後にsnapshotを通知する', () => {
    const battle = createBossBattle({
      clock: createFakeClock(0),
      events: createGameEventBus(),
      roster: [{ id: 'odoruno', characterId: 'ODORUNO' }],
    });
    const submit = vi.spyOn(battle, 'submit');
    const update = vi.spyOn(battle, 'update');
    const getSnapshot = vi.spyOn(battle, 'snapshot');
    const source = createLocalBattleSource(battle, 'odoruno');
    const received: BattleSnapshot[] = [];
    source.onState((next) => received.push(next));

    source.submit({ type: 'ATTACK' });
    source.tick(0.016);

    expect(source.localPlayerId).toBe('odoruno');
    expect(source.kind).toBe('LOCAL');
    expect(submit).toHaveBeenCalledWith('odoruno', { type: 'ATTACK' });
    expect(update).toHaveBeenCalledWith(0.016);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(received).toEqual([getSnapshot.mock.results[0]?.value]);
  });

  it('localPlayerIdを関数で渡すと、送るたびに読み直して操作キャラへ追従する', () => {
    // 操作キャラの切り替え (Issue #106) を source を作り直さずに効かせる。
    // 固定IDを閉じ込めると、切り替えても前のキャラへ入力が飛び続ける。
    const battle = createBossBattle({
      clock: createFakeClock(0),
      events: createGameEventBus(),
      roster: [
        { id: 'odoruno', characterId: 'ODORUNO' },
        { id: 'pay', characterId: 'PAY' },
      ],
    });
    const submit = vi.spyOn(battle, 'submit');
    let active = 'odoruno';
    const source = createLocalBattleSource(battle, () => active);

    source.submit({ type: 'ATTACK' });
    expect(submit).toHaveBeenLastCalledWith('odoruno', { type: 'ATTACK' });
    expect(source.localPlayerId).toBe('odoruno');

    active = 'pay';

    source.submit({ type: 'ATTACK' });
    expect(submit).toHaveBeenLastCalledWith('pay', { type: 'ATTACK' });
    expect(source.localPlayerId).toBe('pay');
  });

  it('解除したonState購読者には以後通知しない', () => {
    const battle = createBossBattle({
      clock: createFakeClock(0),
      events: createGameEventBus(),
      roster: [{ id: 'odoruno', characterId: 'ODORUNO' }],
    });
    const source = createLocalBattleSource(battle, 'odoruno');
    const received: BattleSnapshot[] = [];
    const unsubscribe = source.onState((next) => received.push(next));

    source.tick(0.016);
    unsubscribe();
    source.tick(0.016);

    expect(received).toHaveLength(1);
  });
});
