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

/**
 * 参加用トークンはソースに固定公開しない(誰でもそのplayerを名乗れてしまうため)。
 * `NELDA_TOKEN_ODORUNO` / `NELDA_TOKEN_PAY` / `NELDA_TOKEN_ORA` から読む。
 * テストは `AuthorityServerOptions.tokenToPlayerId` へ直接注入する。
 */
function tokenToPlayerIdFromEnv(env: NodeJS.ProcessEnv): ReadonlyMap<string, string> {
  const entries: readonly [string, string][] = [
    ['NELDA_TOKEN_ODORUNO', 'odoruno-player'],
    ['NELDA_TOKEN_PAY', 'pay-player'],
    ['NELDA_TOKEN_ORA', 'ora-player'],
  ];
  const missing = entries.filter(([name]) => env[name] === undefined || env[name] === '');
  if (missing.length > 0) {
    const names = missing.map(([name]) => name).join(', ');
    throw new Error(`participation tokens are not set: ${names}`);
  }

  return new Map(
    entries.map(([name, playerId]) => {
      const token = env[name];
      if (token === undefined) throw new Error(`unreachable: ${name} was checked above`);
      return [token, playerId];
    }),
  );
}

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
  /**
   * 参加用トークン→playerId。ソースに固定公開する値を渡さないこと。
   * 直接起動時は環境変数から作る({@link tokenToPlayerIdFromEnv})。
   * テストは固定fixtureを直接ここへ注入する。
   */
  readonly tokenToPlayerId: ReadonlyMap<string, string>;
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
    tokenToPlayerId: options.tokenToPlayerId,
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

  // listen失敗(EADDRINUSE等)を含むserver-levelのerrorでは、timerを残したまま
  // 応答不能なプロセスにしない。個別接続のerrorはnode-authority-transport.ts側で
  // 別途隔離済みで、ここには来ない。
  wss.once('error', () => {
    clearInterval(gameUpdateTimer);
    clearInterval(stateBroadcastTimer);
  });

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
  const server = createAuthorityServer({
    port,
    tokenToPlayerId: tokenToPlayerIdFromEnv(process.env),
  });
  const shutdown = (): void => {
    void server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
