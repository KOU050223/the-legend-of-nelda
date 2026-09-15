import type { BattleSnapshot } from '../game/session/boss-battle';
import type { GameAction } from '../game/types/game-action';
import type { WasshoiEvent } from '../input/wasshoi/types';
import type { ClientTransport } from './client-transport';

function reportClientError(error: unknown): void {
  console.error('Realtime battle client handler failed', error);
}

export function createRealtimeBattleClient(options: {
  readonly transport: ClientTransport;
  readonly token: string;
}): {
  readonly submit: (action: GameAction) => void;
  readonly onState: (handler: (battle: BattleSnapshot) => void) => () => void;
  readonly onWasshoi: (handler: (event: WasshoiEvent) => void) => () => void;
} {
  const { transport, token } = options;
  const stateHandlers = new Set<(battle: BattleSnapshot) => void>();
  const wasshoiHandlers = new Set<(event: WasshoiEvent) => void>();
  let connected = true;
  let playerId: string | null = null;
  let epoch: number | null = null;
  let nextSeq = 0;

  transport.onMessage((message) => {
    if (!connected) return;

    if (message.type === 'WELCOME') {
      playerId = message.playerId;
      epoch = message.epoch;
      nextSeq = 0;
      return;
    }

    if (message.type === 'STATE') {
      for (const handler of stateHandlers) {
        try {
          handler(message.battle);
        } catch (error) {
          reportClientError(error);
        }
      }
      return;
    }

    for (const handler of wasshoiHandlers) {
      try {
        handler(message.event);
      } catch (error) {
        reportClientError(error);
      }
    }
  });

  transport.onDisconnected(() => {
    connected = false;
    playerId = null;
    epoch = null;
    nextSeq = 0;
  });

  try {
    transport.sendToAuthority({ type: 'JOIN', token });
  } catch (error) {
    reportClientError(error);
  }

  return {
    submit(action) {
      if (!connected || playerId === null || epoch === null) return;

      nextSeq += 1;
      try {
        transport.sendToAuthority({ type: 'ACTION', epoch, seq: nextSeq, action });
      } catch (error) {
        // 送信結果が不明なACTIONは再送せず、次のseqへ進む。
        reportClientError(error);
      }
    },

    onState(handler) {
      stateHandlers.add(handler);
      return () => {
        stateHandlers.delete(handler);
      };
    },

    onWasshoi(handler) {
      wasshoiHandlers.add(handler);
      return () => {
        wasshoiHandlers.delete(handler);
      };
    },
  };
}
