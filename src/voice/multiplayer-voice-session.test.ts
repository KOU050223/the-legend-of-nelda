import { describe, expect, it } from 'vitest';

import type { LobbyMessage } from '@/multiplayer/protocol';

import {
  createMultiplayerVoiceSessionController,
  configuredMultiplayerVoiceRoomName,
  liveKitTokenRequestFor,
  resolveMultiplayerVoiceContext,
} from './multiplayer-voice-session';

function lobbyFor(role: LobbyMessage['slots'][number]['role'], connected = true): LobbyMessage {
  return {
    type: 'LOBBY',
    slots: [
      { participantId: 'participant-local', role, connected },
      { participantId: 'participant-pay', role: 'PAY', connected: true },
      { participantId: 'participant-ora', role: 'ORA', connected: true },
    ],
    started: false,
    full: false,
  };
}

describe('resolveMultiplayerVoiceContext', () => {
  it.each(['ODORUNO', 'PAY', 'ORA'] as const)(
    'Authorityが確定した%sを同じVoiceRoleへ対応付ける',
    (role) => {
      expect(
        resolveMultiplayerVoiceContext(
          { participantId: 'participant-local', lobby: lobbyFor(role) },
          'authority-demo-room',
        ),
      ).toEqual({
        roomName: 'authority-demo-room',
        participantIdentity: 'participant-local',
        role,
      });
    },
  );

  it('Role未選択・切断済み・AuthorityのRoster外には接続情報を渡さない', () => {
    expect(
      resolveMultiplayerVoiceContext(
        { participantId: 'participant-local', lobby: lobbyFor(null) },
        'room',
      ),
    ).toBeNull();
    expect(
      resolveMultiplayerVoiceContext(
        { participantId: 'participant-local', lobby: lobbyFor('PAY', false) },
        'room',
      ),
    ).toBeNull();
    expect(
      resolveMultiplayerVoiceContext(
        { participantId: 'participant-not-in-lobby', lobby: lobbyFor('PAY') },
        'room',
      ),
    ).toBeNull();
  });

  it('Authorityが将来配信するRoom IDをデプロイ設定より優先する', () => {
    expect(
      resolveMultiplayerVoiceContext(
        {
          participantId: 'participant-local',
          lobby: lobbyFor('ORA'),
          authorityRoomId: 'battle-session-42',
        },
        'deployment-room',
      ),
    ).toMatchObject({ roomName: 'battle-session-42' });
  });

  it('token requestは解決済みのAuthority contextだけから作る', () => {
    const context = resolveMultiplayerVoiceContext(
      { participantId: 'participant-local', lobby: lobbyFor('PAY') },
      'authority-demo-room',
    );
    if (context === null) throw new Error('voice context was not resolved');

    expect(liveKitTokenRequestFor(context)).toEqual({
      roomName: 'authority-demo-room',
      playerId: 'participant-local',
      role: 'PAY',
    });
  });
});

describe('MultiplayerVoiceSessionController', () => {
  it('Authority stateの変更を保持し、離脱時に破棄できる', () => {
    const controller = createMultiplayerVoiceSessionController('deployment-room');

    expect(
      controller.sync({ participantId: 'participant-local', lobby: lobbyFor('ODORUNO') }),
    ).toMatchObject({ role: 'ODORUNO', roomName: 'deployment-room' });
    expect(controller.context()).toMatchObject({ participantIdentity: 'participant-local' });

    controller.clear();
    expect(controller.context()).toBeNull();
  });
});

describe('configuredMultiplayerVoiceRoomName', () => {
  it('空の設定では単一Authority用の既定Roomを使い、空白は正規化する', () => {
    expect(configuredMultiplayerVoiceRoomName('')).toBe('nelda-demo');
    expect(configuredMultiplayerVoiceRoomName('  live-demo  ')).toBe('live-demo');
  });
});
