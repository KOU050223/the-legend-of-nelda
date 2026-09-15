import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { WebSocket, WebSocketServer } from 'ws';

import { createGameEventBus } from '../src/game/events/game-event';
import { createBossBattle, type PlayerSeed } from '../src/game/session/boss-battle';
import type { CharacterId } from '../src/game/config/phase2-player-balance';
import { createBattleRoom, type BattleRoom } from '../src/multiplayer/battle-room';
import { createNodeAuthorityTransport } from './node-authority-transport';

// いずれも暫定値であり、ベンチマークに基づく値ではない。実測後に見直す。
const DEFAULT_GAME_UPDATE_INTERVAL_MS = 50;
const DEFAULT_STATE_BROADCAST_INTERVAL_MS = 100;

const FIXED_ROSTER = [
  { id: 'odoruno-player', characterId: 'ODORUNO' },
  { id: 'pay-player', characterId: 'PAY' },
  { id: 'ora-player', characterId: 'ORA' },
] as const satisfies readonly PlayerSeed[];

const FIXED_TOKEN_TO_PLAYER_ID: ReadonlyMap<string, string> = new Map([
  ['token-odoruno', 'odoruno-player'],
  ['token-pay', 'pay-player'],
  ['token-ora', 'ora-player'],
]);

const FIXED_PLAYER_ID_TO_CHARACTER_ID: ReadonlyMap<string, CharacterId> = new Map([
  ['odoruno-player', 'ODORUNO'],
  ['pay-player', 'PAY'],
  ['ora-player', 'ORA'],
]);

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.once('close', settle);

    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch {
      try {
        socket.terminate();
      } catch {
        settle();
      }
    }

    if (socket.readyState === WebSocket.CLOSED) settle();
  });
}

export interface AuthorityServerOptions {
  readonly port: number;
  /** ms。game update tick。省略時は暫定値を使う。 */
  readonly gameUpdateIntervalMs?: number;
  /** ms。STATE broadcast。省略時は暫定値を使う。 */
  readonly stateBroadcastIntervalMs?: number;
}

export interface AuthorityServer {
  readonly battleRoom: BattleRoom;
  readonly port: number;
  close(): Promise<void>;
}

export function createAuthorityServer(options: AuthorityServerOptions): AuthorityServer {
  const wss = new WebSocketServer({ port: options.port });
  const transport = createNodeAuthorityTransport(wss);
  const battle = createBossBattle({
    clock: { now: () => Date.now() },
    events: createGameEventBus(),
    roster: FIXED_ROSTER,
  });
  const battleRoom = createBattleRoom({
    battle,
    transport,
    tokenToPlayerId: FIXED_TOKEN_TO_PLAYER_ID,
    playerIdToCharacterId: FIXED_PLAYER_ID_TO_CHARACTER_ID,
  });

  const gameUpdateIntervalMs = options.gameUpdateIntervalMs ?? DEFAULT_GAME_UPDATE_INTERVAL_MS;
  const stateBroadcastIntervalMs =
    options.stateBroadcastIntervalMs ?? DEFAULT_STATE_BROADCAST_INTERVAL_MS;

  let lastUpdateAt = performance.now();
  const gameUpdateTimer = setInterval(() => {
    const now = performance.now();
    const deltaSeconds = (now - lastUpdateAt) / 1_000;
    lastUpdateAt = now;
    battleRoom.update(deltaSeconds);
  }, gameUpdateIntervalMs);
  const stateBroadcastTimer = setInterval(() => {
    battleRoom.publishState();
  }, stateBroadcastIntervalMs);

  let closePromise: Promise<void> | undefined;

  function actualPort(): number {
    const address = wss.address();
    if (address !== null && typeof address !== 'string') return address.port;
    return options.port;
  }

  function close(): Promise<void> {
    if (closePromise !== undefined) return closePromise;

    clearInterval(gameUpdateTimer);
    clearInterval(stateBroadcastTimer);

    closePromise = new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const clientClosePromises = [...wss.clients].map((socket) => closeSocket(socket));
      const serverClosePromise = new Promise<void>((serverResolve) => {
        try {
          wss.close(() => serverResolve());
        } catch {
          serverResolve();
        }
      });
      void Promise.all([...clientClosePromises, serverClosePromise]).then(settle);
    });

    return closePromise;
  }

  return {
    battleRoom,
    get port() {
      return actualPort();
    },
    close,
  };
}

function isDirectEntryPoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isDirectEntryPoint()) {
  const port = Number(process.env.PORT ?? 3_000);
  const server = createAuthorityServer({ port });
  const shutdown = (): void => {
    void server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
