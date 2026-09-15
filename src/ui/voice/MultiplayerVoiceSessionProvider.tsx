import { createContext, useContext, type ReactNode } from 'react';

import { useScreenStore } from '@/app/screen';
import { useMultiplayerSessionStore } from '@/multiplayer/session-store';
import {
  useMultiplayerVoiceSession,
  type MultiplayerVoiceSession,
} from '@/ui/matching/use-multiplayer-voice-session';

const MultiplayerVoiceSessionContext = createContext<MultiplayerVoiceSession | null>(null);

/**
 * Voice RoomをMATCHING/GAMEと同じApp寿命で所有する。
 * 画面遷移だけでは切断せず、TITLEへ戻る・Authorityから外れる・App終了時にcleanupする。
 */
export function MultiplayerVoiceSessionProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const participantId = useMultiplayerSessionStore((state) => state.participantId);
  const lobby = useMultiplayerSessionStore((state) => state.lobby);
  const screen = useScreenStore((state) => state.screen);
  const keepVoiceSession = screen === 'MATCHING' || screen === 'GAME';
  const voice = useMultiplayerVoiceSession({ participantId, lobby, keepSession: keepVoiceSession });

  return (
    <MultiplayerVoiceSessionContext.Provider value={voice}>
      {children}
    </MultiplayerVoiceSessionContext.Provider>
  );
}

export function useAppMultiplayerVoiceSession(): MultiplayerVoiceSession {
  const voice = useContext(MultiplayerVoiceSessionContext);
  if (voice === null) {
    throw new Error('MultiplayerVoiceSessionProvider is required for multiplayer voice controls');
  }
  return voice;
}
