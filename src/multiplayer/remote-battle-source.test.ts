import { describe, expect, it } from 'vitest';

import type { BattleSnapshot } from '../game/session/boss-battle';
import type { GameAction } from '../game/types/game-action';
import type { createRealtimeBattleClient } from './realtime-battle-client';

import { createRemoteBattleSource } from './remote-battle-source';

describe('createRemoteBattleSource', () => {
  it('submitとonStateをclientへ委譲し、tickは何もしない', () => {
    const submitted: GameAction[] = [];
    const stateHandlers = new Set<(snapshot: BattleSnapshot) => void>();
    const client: ReturnType<typeof createRealtimeBattleClient> = {
      submit(action) {
        submitted.push(action);
      },
      selectCharacter() {},
      requestStart() {},
      onState(handler) {
        stateHandlers.add(handler);
        return () => stateHandlers.delete(handler);
      },
      onWelcome() {
        return () => {};
      },
      onRoster() {
        return () => {};
      },
      onLobby() {
        return () => {};
      },
      onRoomFull() {
        return () => {};
      },
      onRejected() {
        return () => {};
      },
      onWasshoi() {
        return () => {};
      },
    };
    const source = createRemoteBattleSource(client, 'pay');
    const action: GameAction = { type: 'ATTACK' };
    const snapshot: BattleSnapshot = {
      boss: {
        hp: 1000,
        hpMax: 1000,
        phase: 'INTRO',
        position: { x: 0, z: 0 },
        rotationY: 0,
        attackCount: 0,
        activeAttack: null,
        bossDownUntil: null,
        nextAttackAt: 0,
        takenAt: 0,
      },
      players: [],
      barrier: null,
    };
    const received: BattleSnapshot[] = [];

    source.submit(action);
    const remove = source.onState((next) => received.push(next));
    for (const handler of stateHandlers) handler(snapshot);
    source.tick(10);
    remove();

    expect(source.localPlayerId).toBe('pay');
    expect(source.kind).toBe('REMOTE');
    expect(submitted).toEqual([action]);
    expect(received).toEqual([snapshot]);
    expect(stateHandlers.size).toBe(0);
  });
});
