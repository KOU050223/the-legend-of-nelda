import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterMessage } from '@/multiplayer/protocol';
import type { createRealtimeBattleClient } from '@/multiplayer/realtime-battle-client';

type RealtimeBattleClient = ReturnType<typeof createRealtimeBattleClient>;

const mocks = vi.hoisted(() => ({
  bossArenaScene: vi.fn<(props: { source?: unknown }) => null>(() => null),
}));

// BossArenaSceneはCanvas(react-three-fiber)前提で直接テストしづらいため、
// 「sourceを渡さずに描画されていないか」だけをここで検証する。
vi.mock('../boss/BossArenaScene', () => ({
  BossArenaScene: mocks.bossArenaScene,
}));

import { useScreenStore } from '@/app/screen';
import { useMultiplayerSessionStore } from '@/multiplayer/session-store';

import { MultiplayerArenaScene } from './MultiplayerArenaScene';

const roster: RosterMessage = {
  type: 'ROSTER',
  slots: [
    { playerId: 'odoruno-player', characterId: 'ODORUNO', connected: true },
    { playerId: 'pay-player', characterId: 'PAY', connected: true },
    { playerId: 'ora-player', characterId: 'ORA', connected: true },
  ],
  started: true,
};

const client: RealtimeBattleClient = {
  submit: () => undefined,
  selectCharacter: () => undefined,
  requestStart: () => undefined,
  onWelcome: () => () => undefined,
  onState: () => () => undefined,
  onRoster: () => () => undefined,
  onLobby: () => () => undefined,
  onRoomFull: () => () => undefined,
  onRejected: () => () => undefined,
  onWasshoi: () => () => undefined,
};

function resetSession(): void {
  useMultiplayerSessionStore.setState({
    token: null,
    status: 'NO_TOKEN',
    client: null,
    localPlayerId: null,
    roster: null,
  });
}

describe('MultiplayerArenaScene', () => {
  beforeEach(() => {
    mocks.bossArenaScene.mockClear();
    useScreenStore.setState({ screen: 'GAME' });
    resetSession();
  });

  afterEach(() => {
    cleanup();
    useScreenStore.setState({ screen: 'TITLE' });
    resetSession();
  });

  it('sessionが揃っている間だけBossArenaSceneへremote sourceを渡す', () => {
    useMultiplayerSessionStore.setState({
      status: 'CONNECTED',
      client,
      localPlayerId: 'pay-player',
      roster,
    });

    render(<MultiplayerArenaScene />);

    expect(mocks.bossArenaScene).toHaveBeenCalledOnce();
    const props = mocks.bossArenaScene.mock.calls[0]?.[0];
    expect(props?.source).toBeDefined();
    expect(useScreenStore.getState().screen).toBe('GAME');
  });

  it.each([
    [
      '未接続(NO_TOKEN)',
      { status: 'NO_TOKEN' as const, client: null, localPlayerId: null, roster: null },
    ],
    ['接続中', { status: 'CONNECTING' as const, client: null, localPlayerId: null, roster: null }],
    [
      '接続済みだが3人揃っていない(started=false)',
      {
        status: 'CONNECTED' as const,
        client,
        localPlayerId: 'pay-player',
        roster: { ...roster, started: false },
      },
    ],
    [
      'localPlayerIdがまだ無い(WELCOME未受信)',
      { status: 'CONNECTED' as const, client, localPlayerId: null, roster },
    ],
    [
      '切断済み',
      { status: 'DISCONNECTED' as const, client: null, localPlayerId: null, roster: null },
    ],
  ])('%sのときはBossArenaSceneをsource無しで描画せず、MATCHINGへ差し戻す', (_label, state) => {
    useMultiplayerSessionStore.setState(state);

    render(<MultiplayerArenaScene />);

    // 最重要の安全境界: sourceを渡さない組み合わせでBossArenaSceneを
    // 呼び出すと内部でローカル戦闘へフォールバックしてしまうため、
    // 「そもそも呼ばれない」ことを保証する。
    expect(mocks.bossArenaScene).not.toHaveBeenCalled();
    expect(useScreenStore.getState().screen).toBe('MATCHING');
  });

  it('GAME中に切断されるとMATCHINGへ差し戻り、BossArenaSceneの描画をやめる', () => {
    useMultiplayerSessionStore.setState({
      status: 'CONNECTED',
      client,
      localPlayerId: 'pay-player',
      roster,
    });

    const { rerender } = render(<MultiplayerArenaScene />);
    expect(mocks.bossArenaScene).toHaveBeenCalledOnce();

    useMultiplayerSessionStore.setState({
      status: 'DISCONNECTED',
      client: null,
      localPlayerId: null,
      roster: null,
    });
    rerender(<MultiplayerArenaScene />);

    expect(mocks.bossArenaScene).toHaveBeenCalledOnce();
    expect(useScreenStore.getState().screen).toBe('MATCHING');
  });
});
