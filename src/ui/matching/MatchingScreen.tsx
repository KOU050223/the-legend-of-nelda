import { useEffect } from 'react';

import type { CharacterId } from '@/game/config/phase2-player-balance';
import type { LobbySlot } from '@/multiplayer/protocol';
import { type ConnectionStatus, useMultiplayerSessionStore } from '@/multiplayer/session-store';
import { useScreenStore } from '@/app/screen';
import { useAppMultiplayerVoiceSession } from '@/ui/voice/MultiplayerVoiceSessionProvider';

import styles from './MatchingScreen.module.css';

/** START受理後の演出を見せてからGAMEへ渡すまでの時間。通信は一切待たない。 */
const CELEBRATION_MS = 900;
const CHARACTER_IDS: readonly CharacterId[] = ['ODORUNO', 'PAY', 'ORA'];

interface DisplaySlot extends LobbySlot {
  readonly legacyPlayerId?: string;
}

function statusLabel(status: ConnectionStatus): string {
  if (status === 'CONNECTING') return '接続中';
  if (status === 'CONNECTED') return '接続済み';
  if (status === 'FULL') return '部屋が満員です';
  if (status === 'REJECTED') return '参加を拒否されました';
  if (status === 'DISCONNECTED') return '接続が切断されました';
  return '接続準備中';
}

function legacySlots(
  roster: ReturnType<typeof useMultiplayerSessionStore.getState>['roster'],
): DisplaySlot[] {
  return (
    roster?.slots.map((slot) => ({
      participantId: slot.playerId,
      role: slot.characterId,
      connected: slot.connected,
      legacyPlayerId: slot.playerId,
    })) ?? []
  );
}

function rejectionLabel(reason: string | undefined): string {
  if (reason === 'ROLE_TAKEN') return 'その役割はすでに選ばれています。';
  if (reason === 'ROLE_LOCKED') return '開始後は役割を変更できません。';
  if (reason === 'START_NOT_ALLOWED') return '3人の役割が揃ってから開始できます。';
  if (reason === 'INVALID_TOKEN') return '参加tokenが無効です。';
  return 'サーバーが参加を受け付けませんでした。';
}

export function MatchingScreen(): React.JSX.Element {
  const status = useMultiplayerSessionStore((state) => state.status);
  const participantId = useMultiplayerSessionStore((state) => state.participantId);
  const localPlayerId = useMultiplayerSessionStore((state) => state.localPlayerId);
  const roster = useMultiplayerSessionStore((state) => state.roster);
  const lobby = useMultiplayerSessionStore((state) => state.lobby);
  const fullRoom = useMultiplayerSessionStore((state) => state.fullRoom);
  const phase = useMultiplayerSessionStore((state) => state.phase);
  const rejected = useMultiplayerSessionStore((state) => state.rejected);
  const slots: readonly DisplaySlot[] = lobby?.slots ?? fullRoom?.slots ?? legacySlots(roster);
  const localId =
    lobby === null && fullRoom === null ? (localPlayerId ?? participantId) : participantId;
  const localSlot = slots.find((slot) => slot.participantId === localId);
  const started = phase === 'STARTED' || lobby?.started === true || roster?.started === true;
  const isFull = status === 'FULL' || fullRoom !== null;
  const canEditRole =
    status === 'CONNECTED' && !started && !isFull && localSlot?.connected === true;
  const allSlotsReady =
    slots.length === 3 &&
    slots.every((slot) => slot.connected && slot.role !== null) &&
    new Set(slots.map((slot) => slot.role)).size === 3;
  const canStart = canEditRole && allSlotsReady;
  const voice = useAppMultiplayerVoiceSession();

  useEffect(() => {
    useMultiplayerSessionStore.getState().connect();
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    const timer = window.setTimeout(() => {
      useScreenStore.getState().goTo('GAME');
    }, CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [started]);

  return (
    <main className={styles.page}>
      <div className={styles.stars} aria-hidden="true" />

      <section className={styles.panel} aria-labelledby="matching-title">
        <p className={styles.eyebrow}>MULTIPLAYER</p>
        <h1 id="matching-title" className={styles.title}>
          {isFull ? 'この部屋は満員です' : '仲間を待っています'}
        </h1>
        <output className={styles.status} aria-label="接続状態">
          {statusLabel(status)}
        </output>

        {localSlot?.role !== null && localSlot?.role !== undefined && (
          <p className={styles.youLine}>自分の役割: {localSlot.role}</p>
        )}

        {isFull && (
          <p className={styles.fullNotice}>
            参加枠は3人までです。観戦・待機・自動昇格はありません。
          </p>
        )}

        {slots.length > 0 ? (
          <ul className={styles.futons} aria-label="参加者">
            {slots.map((slot, index) => {
              const isYou = slot.participantId === localId;
              const roleName = slot.role ?? '役割未選択';
              return (
                <li
                  key={slot.participantId ?? `empty-${index}`}
                  className={[
                    styles.futon,
                    slot.connected ? styles.futonConnected : styles.futonEmpty,
                    started ? styles.futonStarted : '',
                  ].join(' ')}
                >
                  <div className={styles.pillow} aria-hidden="true" />
                  <div className={styles.sleeper} aria-hidden="true">
                    {slot.connected ? (started ? '☀️' : '🌙') : ''}
                  </div>
                  <p className={styles.characterName}>
                    {roleName}
                    {isYou && <span className={styles.you}>YOU</span>}
                  </p>
                  <p className={styles.slotStatus}>
                    {slot.connected
                      ? '接続済み'
                      : slot.participantId === null
                        ? '空き'
                        : slot.legacyPlayerId !== undefined
                          ? '未接続'
                          : '切断中'}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>参加者情報を待っています</p>
        )}

        {canEditRole && (
          <fieldset className={styles.rolePicker}>
            <legend>{localSlot?.role === null ? '役割を選ぶ' : '役割を変更'}</legend>
            <div className={styles.roleCards}>
              {CHARACTER_IDS.map((characterId) => {
                const selected = localSlot?.role === characterId;
                const taken = slots.some(
                  (slot) => slot.participantId !== localId && slot.role === characterId,
                );
                return (
                  <button
                    key={characterId}
                    className={[styles.roleCard, selected ? styles.roleCardSelected : ''].join(' ')}
                    type="button"
                    disabled={taken}
                    aria-pressed={selected}
                    onClick={() =>
                      useMultiplayerSessionStore.getState().selectCharacter(characterId)
                    }
                  >
                    {characterId}
                    {taken ? '（選択済み）' : selected ? '（自分）' : ''}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <VoiceChatPanel voice={voice} />

        {canEditRole && (
          <button
            className={styles.startButton}
            type="button"
            disabled={!canStart}
            onClick={() => useMultiplayerSessionStore.getState().requestStart()}
          >
            START
          </button>
        )}

        {started && <p className={styles.startedStamp}>STARTED</p>}

        {rejected !== null && (
          <p className={styles.errorNotice} role="alert">
            {rejectionLabel(rejected.reason)}
          </p>
        )}

        {status === 'DISCONNECTED' && (
          <button
            className={styles.button}
            type="button"
            onClick={() => useMultiplayerSessionStore.getState().connect()}
          >
            再接続
          </button>
        )}
      </section>
    </main>
  );
}

function VoiceChatPanel({
  voice,
}: {
  voice: ReturnType<typeof useAppMultiplayerVoiceSession>;
}): React.JSX.Element | null {
  if (voice.context === null) return null;

  const payMode = voice.context.role === 'PAY';
  const connection = voice.snapshot.connection;
  const isConnected = connection === 'CONNECTED' || connection === 'RECONNECTING';

  return (
    <section className={styles.voicePanel} aria-label="ボイスチャット">
      <p className={styles.voiceTitle}>VOICE CHAT</p>
      <output className={styles.voiceStatus} aria-label="ボイスチャット接続状態">
        {connection}
      </output>
      <p className={styles.voiceMode}>
        {payMode ? 'MIC: WASSHOI MODE' : `MIC: ${voice.snapshot.microphone}`}
      </p>
      {payMode && voice.enabled && (
        <p className={styles.voiceInput}>
          WASSHOI INPUT: {voice.payInputActive ? 'ACTIVE' : voice.payInputStatus.toUpperCase()}
        </p>
      )}
      {!voice.enabled ? (
        <button
          className={styles.voiceButton}
          type="button"
          disabled={voice.busy}
          onClick={() => void voice.enable()}
        >
          {voice.busy ? 'VOICE 接続中…' : payMode ? 'VOICEを有効にする' : 'マイクを有効にする'}
        </button>
      ) : payMode ? (
        <button className={styles.voiceButton} type="button" onClick={() => void voice.disable()}>
          VOICEを無効にする
        </button>
      ) : (
        <div className={styles.voiceButtons}>
          <button
            className={styles.voiceButton}
            type="button"
            disabled={!isConnected}
            onClick={() => void voice.toggleMicrophone()}
          >
            {voice.snapshot.microphone === 'ON' ? 'マイクをOFFにする' : 'マイクをONにする'}
          </button>
          <button className={styles.voiceButton} type="button" onClick={() => void voice.disable()}>
            VOICEを無効にする
          </button>
        </div>
      )}
      {voice.snapshot.error !== null && (
        <p className={styles.voiceError} role="alert">
          VOICE ERROR: {voice.snapshot.error}
        </p>
      )}
    </section>
  );
}
