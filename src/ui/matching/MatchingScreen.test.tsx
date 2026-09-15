import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterMessage } from '@/multiplayer/protocol';
import type { ClientTransport } from '@/multiplayer/client-transport';
import type { CharacterId } from '@/game/config/phase2-player-balance';
import type { createRealtimeBattleClient } from '@/multiplayer/realtime-battle-client';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn<() => ConnectionHarness['client']>(),
  createTransport: vi.fn<() => ClientTransport>(),
}));

vi.mock('@/multiplayer/client-transport', () => ({
  createWebSocketClientTransport: mocks.createTransport,
}));
vi.mock('@/multiplayer/realtime-battle-client', () => ({
  createRealtimeBattleClient: mocks.createClient,
}));

import { useScreenStore } from '@/app/screen';
import { useMultiplayerSessionStore } from '@/multiplayer/session-store';

import { MatchingScreen } from './MatchingScreen';

interface ConnectionHarness {
  readonly transport: ClientTransport;
  readonly client: ReturnType<typeof createRealtimeBattleClient>;
  disconnect: () => void;
}

function createConnectionHarness(): ConnectionHarness {
  let disconnectedHandler: (() => void) | undefined;
  const transport: ClientTransport = {
    sendToAuthority: () => undefined,
    onMessage: () => () => undefined,
    onDisconnected(handler) {
      disconnectedHandler = handler;
      return () => {
        if (disconnectedHandler === handler) disconnectedHandler = undefined;
      };
    },
  };

  return {
    transport,
    client: {
      submit: () => undefined,
      selectCharacter: vi.fn<(characterId: CharacterId) => void>(),
      requestStart: vi.fn<() => void>(),
      onState: () => () => undefined,
      onWasshoi: () => () => undefined,
      onWelcome: () => () => undefined,
      onRoster: () => () => undefined,
      onLobby: () => () => undefined,
      onRoomFull: () => () => undefined,
      onRejected: () => () => undefined,
    },
    disconnect: () => disconnectedHandler?.(),
  };
}

const roster: RosterMessage = {
  type: 'ROSTER',
  slots: [
    { playerId: 'odoruno-player', characterId: 'ODORUNO', connected: true },
    { playerId: 'pay-player', characterId: 'PAY', connected: true },
    { playerId: 'ora-player', characterId: 'ORA', connected: false },
  ],
  started: false,
};

describe('MatchingScreen', () => {
  const connections: ConnectionHarness[] = [];

  beforeEach(() => {
    window.history.replaceState({}, '', '/matching');
    connections.length = 0;
    mocks.createTransport.mockImplementation(() => {
      const connection = createConnectionHarness();
      connections.push(connection);
      return connection.transport;
    });
    mocks.createClient.mockImplementation(() => {
      const connection = connections.at(-1);
      if (connection === undefined) throw new Error('transport was not created');
      return connection.client;
    });
    useScreenStore.setState({ screen: 'MATCHING' });
    useMultiplayerSessionStore.setState({
      participantId: 'participant-test',
      token: 'token-pay',
      status: 'NO_TOKEN',
      client: null,
      localPlayerId: null,
      roster: null,
      lobby: null,
      fullRoom: null,
      phase: 'MATCHING',
      rejected: null,
    });
  });

  afterEach(() => {
    cleanup();
    mocks.createClient.mockReset();
    mocks.createTransport.mockReset();
    useScreenStore.setState({ screen: 'TITLE' });
    useMultiplayerSessionStore.setState({
      participantId: null,
      token: null,
      status: 'NO_TOKEN',
      client: null,
      localPlayerId: null,
      roster: null,
      lobby: null,
      fullRoom: null,
      phase: 'MATCHING',
      rejected: null,
    });
    window.history.replaceState({}, '', '/');
  });

  it('StrictModeの二重マウントでも接続を1つだけ作る', () => {
    render(
      <StrictMode>
        <MatchingScreen />
      </StrictMode>,
    );

    expect(mocks.createTransport).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledOnce();
  });

  it('参加者の接続状態と自分の役割を表示する', () => {
    useMultiplayerSessionStore.setState({
      status: 'CONNECTED',
      localPlayerId: 'pay-player',
      roster,
    });

    render(<MatchingScreen />);

    expect(screen.getByLabelText('接続状態')).toHaveTextContent('接続済み');
    expect(screen.getByText('自分の役割: PAY')).toBeInTheDocument();

    const slots = screen.getAllByRole('listitem');
    const odoruno = slots.find((slot) => slot.textContent?.includes('ODORUNO'));
    const ora = slots.find((slot) => slot.textContent?.includes('ORA'));
    expect(odoruno?.textContent).toContain('接続済み');
    expect(ora?.textContent).toContain('未接続');
  });

  it('開始前は役割カードから選択でき、3役が揃った後だけSTARTを送る', () => {
    render(<MatchingScreen />);
    const connection = connections[0];
    if (connection === undefined) throw new Error('connection was not created');

    act(() => {
      useMultiplayerSessionStore.setState({
        status: 'CONNECTED',
        participantId: 'participant-test',
        client: connection.client,
        lobby: {
          type: 'LOBBY',
          slots: [
            { participantId: 'participant-test', role: null, connected: true },
            { participantId: 'participant-b', role: null, connected: true },
            { participantId: 'participant-c', role: null, connected: true },
          ],
          started: false,
          full: false,
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /^ODORUNO$/ }));
    expect(connection.client.selectCharacter).toHaveBeenCalledWith('ODORUNO');
    expect(screen.getByRole('button', { name: 'START' })).toBeDisabled();

    act(() => {
      useMultiplayerSessionStore.setState({
        lobby: {
          type: 'LOBBY',
          slots: [
            { participantId: 'participant-test', role: 'ODORUNO', connected: true },
            { participantId: 'participant-b', role: 'PAY', connected: true },
            { participantId: 'participant-c', role: 'ORA', connected: true },
          ],
          started: false,
          full: false,
        },
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    expect(connection.client.requestStart).toHaveBeenCalledOnce();
  });

  it('Authorityが自分のRoleを確定するとVoice Chatの接続UIを表示する', () => {
    useMultiplayerSessionStore.setState({
      status: 'CONNECTED',
      participantId: 'participant-test',
      lobby: {
        type: 'LOBBY',
        slots: [
          { participantId: 'participant-test', role: 'ORA', connected: true },
          { participantId: 'participant-b', role: 'PAY', connected: true },
          { participantId: 'participant-c', role: 'ODORUNO', connected: true },
        ],
        started: false,
        full: false,
      },
    });

    render(<MatchingScreen />);

    expect(screen.getByRole('region', { name: 'ボイスチャット' })).toBeInTheDocument();
    expect(screen.getByLabelText('ボイスチャット接続状態')).toHaveTextContent('DISCONNECTED');
    expect(screen.getByRole('button', { name: 'マイクを有効にする' })).toBeInTheDocument();
  });

  it('4人目のfull状態では役割選択とSTARTを表示しない', () => {
    useMultiplayerSessionStore.setState({
      status: 'FULL',
      participantId: 'participant-fourth',
      fullRoom: {
        type: 'ROOM_FULL',
        slots: [
          { participantId: 'participant-a', role: 'ODORUNO', connected: true },
          { participantId: 'participant-b', role: 'PAY', connected: true },
          { participantId: 'participant-c', role: 'ORA', connected: true },
        ],
        started: false,
      },
    });

    render(<MatchingScreen />);

    expect(screen.getByRole('heading', { name: 'この部屋は満員です' })).toBeInTheDocument();
    expect(screen.getByLabelText('接続状態')).toHaveTextContent('部屋が満員です');
    expect(screen.getByText(/観戦・待機・自動昇格はありません/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'START' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '役割を選ぶ' })).not.toBeInTheDocument();
  });

  it('役割選択の拒否をエラー表示しつつ、開始前の変更操作を残す', () => {
    useMultiplayerSessionStore.setState({
      status: 'CONNECTED',
      participantId: 'participant-test',
      rejected: { type: 'REJECTED', reason: 'ROLE_TAKEN' },
      lobby: {
        type: 'LOBBY',
        slots: [
          { participantId: 'participant-test', role: null, connected: true },
          { participantId: 'participant-b', role: 'PAY', connected: true },
          { participantId: 'participant-c', role: 'ORA', connected: true },
        ],
        started: false,
        full: false,
      },
    });

    render(<MatchingScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent('その役割はすでに選ばれています');
    expect(screen.getByRole('group', { name: '役割を選ぶ' })).toBeInTheDocument();
  });

  it('切断後は再接続を選べる', () => {
    render(<MatchingScreen />);
    const firstConnection = connections[0];
    if (firstConnection === undefined) throw new Error('connection was not created');

    act(() => {
      firstConnection.disconnect();
    });

    fireEvent.click(screen.getByRole('button', { name: '再接続' }));

    expect(mocks.createTransport).toHaveBeenCalledTimes(2);
  });

  it('全員が揃って開始済みなら少し演出してからGAMEへ遷移する', () => {
    vi.useFakeTimers();
    try {
      useMultiplayerSessionStore.setState({
        status: 'CONNECTED',
        roster: { ...roster, started: true },
      });

      render(<MatchingScreen />);

      // 通信状態はすでに"揃った"はずだが、演出のあいだはまだMATCHING側に
      // 留まる (通信ロジックそのものは待たせていないことの確認)。
      expect(useScreenStore.getState().screen).toBe('MATCHING');
      expect(screen.getByText('STARTED')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(useScreenStore.getState().screen).toBe('GAME');
      expect(window.location.pathname).toBe('/game');
    } finally {
      vi.useRealTimers();
    }
  });
});
