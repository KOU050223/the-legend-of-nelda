import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { WebSocket, WebSocketServer } from 'ws';

import { createGameEventBus } from '../src/game/events/game-event';
import { createBossBattle, type PlayerSeed } from '../src/game/session/boss-battle';
import type { CharacterId } from '../src/game/config/phase2-player-balance';
import type { PlanarPosition } from '../src/game/movement/types';
import { createBattleRoom, type BattleRoom } from '../src/multiplayer/battle-room';
import { createNodeAuthorityTransport } from './node-authority-transport';

/**
 * 位置未指定だとcreatePlayerの既定値({x:0,z:0})へ3人とも重なる
 * (src/game/player/player-state.ts)。ARENA_BOUNDS(arena.ts)のSPAWN_POINTSは
 * ローカルdev(徒歩でボスへ近づく前提)用で18ユニット離れておりATTACK_REACH(3)
 * の外になるため、代わりにボス直近の小さいオフセットだけを与える
 * (spawn systemや動的配置は作らない、最小の重なり回避)。
 */
const DEFAULT_SPAWN_OFFSETS: readonly [PlanarPosition, PlanarPosition, PlanarPosition] = [
  { x: -1, z: 1 },
  { x: 1, z: 1 },
  { x: 0, z: -1 },
];

// いずれも暫定値であり、ベンチマークに基づく値ではない。実測後に見直す。
const DEFAULT_GAME_UPDATE_INTERVAL_MS = 50;
const DEFAULT_STATE_BROADCAST_INTERVAL_MS = 100;

/**
 * 参加用tokenはソースに固定公開しない。全ブラウザが同じroom tokenを使い、
 * participantIdは各ブラウザのsessionStorageから別に送る。
 *
 * NELDA_ROOM_TOKENは任意。3人固定・デモ用途・認証なしがこのプロダクトの
 * 前提なので、未設定ならroomは無条件でJOINを受け付ける(battle-room.ts
 * のauthorizedTokensが空集合になり、token値そのものを検証しなくなる)。
 * 推測されたくない環境だけ、値を設定して任意で絞ればよい。
 */
function roomTokenFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const token = env.NELDA_ROOM_TOKEN;
  return token === undefined || token === '' ? undefined : token;
}

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
   * #47 互換。新modeではmapのkeyだけを共有room tokenとして認証する。
   * role/player identityの値は参照しない。
   */
  readonly tokenToPlayerId?: ReadonlyMap<string, string>;
  /** 新しい共有room token→room id wiring。省略時はtokenToPlayerIdのkeyを使う。 */
  readonly tokenToRoomId?: ReadonlyMap<string, string>;
  /** 直接起動時の共有token。 */
  readonly roomToken?: string;
  /** テスト/埋め込み用。START時に凍結role mappingから遅延生成する。 */
  readonly createBattle?: (
    roles: ReadonlyMap<string, CharacterId>,
  ) => ReturnType<typeof createBossBattle>;
  /** createBattleの別名。既存のfactory wiringと接続するために受け付ける。 */
  readonly battleFactory?: (
    roles: ReadonlyMap<string, CharacterId>,
  ) => ReturnType<typeof createBossBattle>;
}

export interface AuthorityServer {
  readonly battleRoom: BattleRoom;
  readonly port: number;
  close(): Promise<void>;
}

export function createAuthorityServer(options: AuthorityServerOptions): AuthorityServer {
  const wss = new WebSocketServer({ port: options.port });
  const transport = createNodeAuthorityTransport(wss);
  const createBattle =
    options.createBattle ??
    options.battleFactory ??
    ((roles: ReadonlyMap<string, CharacterId>) => {
      const roster: PlayerSeed[] = [...roles].map(([participantId, characterId], index) => ({
        id: participantId,
        characterId,
        position: DEFAULT_SPAWN_OFFSETS[index] ?? DEFAULT_SPAWN_OFFSETS[0],
      }));
      return createBossBattle({
        clock: { now: () => Date.now() },
        events: createGameEventBus(),
        roster,
      });
    });
  const battleRoom = createBattleRoom({
    transport,
    ...(options.tokenToRoomId === undefined ? {} : { tokenToRoomId: options.tokenToRoomId }),
    ...(options.tokenToPlayerId === undefined ? {} : { tokenToPlayerId: options.tokenToPlayerId }),
    ...(options.roomToken === undefined ? {} : { roomToken: options.roomToken }),
    createBattle,
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
  const roomToken = roomTokenFromEnv(process.env);
  const server = createAuthorityServer({
    port,
    tokenToPlayerId: new Map(),
    ...(roomToken === undefined ? {} : { roomToken }),
  });
  const shutdown = (): void => {
    void server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
