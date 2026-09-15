import { describe, expect, it } from 'vitest';

import type { BattleSnapshot } from '../game/session/boss-battle';
import type { GameAction } from '../game/types/game-action';
import type { AuthorityToClientMessage, ClientToAuthorityMessage, RosterMessage } from './protocol';
import { createRealtimeBattleClient } from './realtime-battle-client';
import type { ClientTransport } from './client-transport';

function createClientTransportHarness() {
  const messageHandlers = new Set<(message: AuthorityToClientMessage) => void>();
  const disconnectedHandlers = new Set<() => void>();
  const sent: ClientToAuthorityMessage[] = [];
  const transport: ClientTransport = {
    sendToAuthority(message) {
      sent.push(message);
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onDisconnected(handler) {
      disconnectedHandlers.add(handler);
      return () => disconnectedHandlers.delete(handler);
    },
  };

  return {
    transport,
    sent,
    receive(message: AuthorityToClientMessage): void {
      for (const handler of messageHandlers) handler(message);
    },
    disconnect(): void {
      for (const handler of disconnectedHandlers) handler();
    },
  };
}

const battle: BattleSnapshot = {
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
const attack: GameAction = { type: 'ATTACK' };

describe('createRealtimeBattleClient', () => {
  it('JOINへparticipantIdを付け、役割選択とSTARTをidentity無しで送信する', () => {
    const harness = createClientTransportHarness();
    const client = createRealtimeBattleClient({
      transport: harness.transport,
      token: 'shared-room-token',
      participantId: 'participant-pay',
    });

    harness.receive({ type: 'WELCOME', participantId: 'participant-pay', epoch: 1 });
    (client as typeof client & { selectCharacter: (role: 'PAY') => void }).selectCharacter('PAY');
    (client as typeof client & { requestStart: () => void }).requestStart();

    expect(harness.sent).toEqual([
      { type: 'JOIN', token: 'shared-room-token', participantId: 'participant-pay' },
      { type: 'SELECT_CHARACTER', characterId: 'PAY' },
      { type: 'START' },
    ]);
  });

  it('生成時にJOINを送りWELCOME後のACTIONへepochと連番を付ける', () => {
    const harness = createClientTransportHarness();
    const client = createRealtimeBattleClient({ transport: harness.transport, token: 'token-pay' });

    harness.receive({ type: 'WELCOME', playerId: 'pay-player', epoch: 7 });
    client.submit(attack);
    client.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });

    expect(harness.sent).toEqual([
      { type: 'JOIN', token: 'token-pay' },
      { type: 'ACTION', epoch: 7, seq: 1, action: attack },
      {
        type: 'ACTION',
        epoch: 7,
        seq: 2,
        action: { type: 'MOVE', input: { forward: 1, right: 0 } },
      },
    ]);
  });

  it('WELCOME前と切断後のACTIONを送信しない', () => {
    const harness = createClientTransportHarness();
    const client = createRealtimeBattleClient({ transport: harness.transport, token: 'token-pay' });

    client.submit(attack);
    harness.receive({ type: 'WELCOME', playerId: 'pay-player', epoch: 1 });
    harness.disconnect();
    client.submit(attack);

    expect(harness.sent).toEqual([{ type: 'JOIN', token: 'token-pay' }]);
  });

  it('STATEとWASSHOIを購読者へ配送し解除後は配送しない', () => {
    const harness = createClientTransportHarness();
    const client = createRealtimeBattleClient({ transport: harness.transport, token: 'token-pay' });
    const states: BattleSnapshot[] = [];
    const events: number[] = [];
    const unsubscribeState = client.onState((snapshot) => states.push(snapshot));
    client.onWasshoi((event) => events.push(event.durationMs));

    harness.receive({ type: 'STATE', battle });
    harness.receive({
      type: 'WASSHOI',
      event: { type: 'WASSHOI', intensity: 0.5, durationMs: 300 },
    });
    unsubscribeState();
    harness.receive({ type: 'STATE', battle });

    expect(states).toEqual([battle]);
    expect(events).toEqual([300]);
  });

  it('WELCOMEとROSTERを購読者へ配送し解除後は配送しない', () => {
    const harness = createClientTransportHarness();
    const client = createRealtimeBattleClient({ transport: harness.transport, token: 'token-pay' });
    const welcomes: Array<{ playerId: string; epoch: number }> = [];
    const rosters: RosterMessage[] = [];
    const unsubscribeWelcome = client.onWelcome((welcome) => welcomes.push(welcome));
    const unsubscribeRoster = client.onRoster((roster) => rosters.push(roster));
    const roster: RosterMessage = {
      type: 'ROSTER',
      slots: [{ playerId: 'pay-player', characterId: 'PAY', connected: true }],
      started: false,
    };

    harness.receive({ type: 'WELCOME', playerId: 'pay-player', epoch: 3 });
    harness.receive(roster);
    unsubscribeWelcome();
    unsubscribeRoster();
    harness.receive({ type: 'WELCOME', playerId: 'pay-player', epoch: 4 });
    harness.receive({ ...roster, started: true });

    expect(welcomes).toEqual([{ playerId: 'pay-player', epoch: 3 }]);
    expect(rosters).toEqual([roster]);
  });
});
