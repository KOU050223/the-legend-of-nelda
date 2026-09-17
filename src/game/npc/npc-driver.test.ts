import { describe, expect, it } from 'vitest';

import type { GameAction } from '../types/game-action';
import { createBossBattle, type BattleSnapshot } from '../session/boss-battle';
import { createGameEventBus } from '../events/game-event';
import type { BattleForNpc } from './npc-driver';
import { createNpcDriver } from './npc-driver';
import { NO_MOVEMENT, type NpcDecision, type NpcPolicy } from './npc-policy';

/**
 * 所有の解決だけを見たいので、戦闘は使わず submit を記録するだけの
 * スタブを置く。判断の中身は utility-policy.test.ts が見ている。
 *
 * `NpcDriver` が使うのは `submit` と `snapshot` だけなので、
 * `BossBattle` 全体ではなくその2つに絞った型で受ける。
 */
function stubBattle(): {
  battle: BattleForNpc;
  submitted: { playerId: string; action: GameAction }[];
} {
  const submitted: { playerId: string; action: GameAction }[] = [];

  return {
    battle: {
      submit(playerId, action) {
        submitted.push({ playerId, action });
      },
      snapshot: () => EMPTY_SNAPSHOT,
    },
    submitted,
  };
}

/** ポリシーを差し替えているので、中身は読まれない。 */
const EMPTY_SNAPSHOT: BattleSnapshot = {
  boss: createBossBattle({
    clock: { now: () => 0 },
    events: createGameEventBus(),
    roster: [{ id: 'odoruno', characterId: 'ODORUNO' }],
    solo: true,
  }).snapshot().boss,
  players: [],
  barrier: null,
  finale: 'NONE',
};

/** 常に同じ決定を返すポリシー。 */
function fixedPolicy(decision: NpcDecision): NpcPolicy {
  return () => decision;
}

const MOVE_FORWARD: NpcDecision = { movement: { forward: 1, right: 0 }, action: null };

describe('NPCの担当', () => {
  it('人間が操作しているキャラへは入力を送らない', () => {
    const { battle, submitted } = stubBattle();
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay', 'ora'],
      readLocalPlayerId: () => 'odoruno',
      policy: fixedPolicy(MOVE_FORWARD),
    });

    driver.tick(battle);

    expect(submitted.map((entry) => entry.playerId)).toEqual(['pay', 'ora']);
  });

  it('操作キャラを切り替えると、担当が入れ替わる', () => {
    const { battle, submitted } = stubBattle();
    let human = 'odoruno';
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay', 'ora'],
      readLocalPlayerId: () => human,
      policy: fixedPolicy(MOVE_FORWARD),
    });

    driver.tick(battle);
    // 切り替え。固定していると、ここで担当が古いままになる。
    human = 'pay';
    submitted.length = 0;
    driver.tick(battle);

    const movedPlayers = submitted.map((entry) => entry.playerId);
    expect(movedPlayers).toContain('odoruno');
    expect(movedPlayers).not.toContain('pay');
  });

  it('操作を離れたキャラは、次のフレームから移動を受け取る', () => {
    const { battle, submitted } = stubBattle();
    let human = 'odoruno';
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay'],
      readLocalPlayerId: () => human,
      policy: fixedPolicy(MOVE_FORWARD),
    });

    driver.tick(battle);
    human = 'pay';
    submitted.length = 0;
    driver.tick(battle);

    // 人間が握っていた間の移動は覚えていないので、改めて送る。
    expect(submitted).toContainEqual({
      playerId: 'odoruno',
      action: { type: 'MOVE', input: { forward: 1, right: 0 } },
    });
  });
});

describe('移動入力の送信', () => {
  it('同じ向きが続くあいだは繰り返し送らない', () => {
    const { battle, submitted } = stubBattle();
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay'],
      readLocalPlayerId: () => 'odoruno',
      policy: fixedPolicy(MOVE_FORWARD),
    });

    driver.tick(battle);
    driver.tick(battle);
    driver.tick(battle);

    // MOVE は押しっぱなしとして Player に残るので、1回で足りる。
    expect(submitted.filter((entry) => entry.action.type === 'MOVE')).toHaveLength(1);
  });

  it('向きが変わったら送り直す', () => {
    const { battle, submitted } = stubBattle();
    let decision = MOVE_FORWARD;
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay'],
      readLocalPlayerId: () => 'odoruno',
      policy: () => decision,
    });

    driver.tick(battle);
    decision = { movement: { forward: 0, right: 1 }, action: null };
    driver.tick(battle);

    expect(submitted.filter((entry) => entry.action.type === 'MOVE')).toHaveLength(2);
  });

  it('止まるときは 0 のベクトルを送る', () => {
    const { battle, submitted } = stubBattle();
    let decision = MOVE_FORWARD;
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay'],
      readLocalPlayerId: () => 'odoruno',
      policy: () => decision,
    });

    driver.tick(battle);
    // 止まる決定。送らないと、押しっぱなしの移動が残って滑り続ける。
    decision = { movement: NO_MOVEMENT, action: null };
    driver.tick(battle);

    expect(submitted).toContainEqual({
      playerId: 'pay',
      action: { type: 'MOVE', input: NO_MOVEMENT },
    });
  });
});

describe('離散アクションの送信', () => {
  it('決定にアクションがあれば送る', () => {
    const { battle, submitted } = stubBattle();
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay'],
      readLocalPlayerId: () => 'odoruno',
      policy: fixedPolicy({ movement: NO_MOVEMENT, action: { type: 'ATTACK' } }),
    });

    driver.tick(battle);

    expect(submitted).toContainEqual({ playerId: 'pay', action: { type: 'ATTACK' } });
  });

  it('アクションが無いフレームでは移動だけを送る', () => {
    const { battle, submitted } = stubBattle();
    const driver = createNpcDriver({
      rosterIds: ['odoruno', 'pay'],
      readLocalPlayerId: () => 'odoruno',
      policy: fixedPolicy(MOVE_FORWARD),
    });

    driver.tick(battle);

    expect(submitted.every((entry) => entry.action.type === 'MOVE')).toBe(true);
  });
});
