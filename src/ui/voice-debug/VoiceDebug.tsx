import { useCallback, useEffect, useRef, useState } from 'react';

import { playSystemWasshoi } from '@/input/wasshoi/system-wasshoi-engine';
import {
  attachWasshoiInput,
  type WasshoiInputController,
  type WasshoiInputStatus,
} from '@/input/wasshoi/wasshoi-input';
import type { WasshoiEvent } from '@/input/wasshoi/types';
import {
  createLiveKitVoiceSession,
  requestLiveKitCredentials,
  type LiveKitVoiceSession,
  type VoiceRole,
  type VoiceSessionSnapshot,
} from '@/voice/livekit-voice-session';

import styles from './VoiceDebug.module.css';

const defaultSnapshot: VoiceSessionSnapshot = {
  connection: 'DISCONNECTED',
  microphone: 'OFF',
  participants: [],
  lastWasshoiEvent: null,
  error: null,
};

function asVoiceRole(value: string): VoiceRole {
  if (value === 'ORA' || value === 'PAY') return value;
  return 'ODORUNO';
}

// `crypto.randomUUID()` は secure context 限定のため、LAN の http:// 開発URLでも
// 動くように一意性が十分なローカル用 suffix へフォールバックする。
function createPlayerId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return `daisuke-${uuid.slice(0, 8)}`;

  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(bytes);
  const suffix = (bytes[0] ?? Math.floor(Math.random() * 0x1_0000_0000)).toString(36);
  return `daisuke-${Date.now().toString(36)}-${suffix}`;
}

/** Issue #82 の複数ブラウザ手動確認用。通常ゲーム画面に常駐させない。 */
export function VoiceDebug(): React.JSX.Element {
  const [role, setRole] = useState<VoiceRole>('ODORUNO');
  const [roomName, setRoomName] = useState('nelda-dev');
  const [playerId, setPlayerId] = useState(createPlayerId);
  const [liveKitUrl, setLiveKitUrl] = useState(import.meta.env.VITE_LIVEKIT_URL ?? '');
  const [developmentToken, setDevelopmentToken] = useState('');
  const [snapshot, setSnapshot] = useState<VoiceSessionSnapshot>(defaultSnapshot);
  const [payMicStatus, setPayMicStatus] = useState<WasshoiInputStatus>('idle');
  const [payInputActive, setPayInputActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<LiveKitVoiceSession | null>(null);
  const wasshoiRef = useRef<WasshoiInputController | null>(null);
  const variantRef = useRef(0);

  const stopPayInput = useCallback((): void => {
    wasshoiRef.current?.stop();
    wasshoiRef.current = null;
    setPayMicStatus('idle');
    setPayInputActive(false);
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    stopPayInput();
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.disconnect();
    setSnapshot(defaultSnapshot);
  }, [stopPayInput]);

  useEffect(
    () => () => {
      void disconnect();
    },
    [disconnect],
  );

  const connect = useCallback(async (): Promise<void> => {
    if (sessionRef.current !== null || busy) return;
    setBusy(true);
    const session = createLiveKitVoiceSession({
      role,
      onSnapshot: setSnapshot,
      onWasshoi: (event) => {
        playSystemWasshoi(event, variantRef.current);
        variantRef.current += 1;
      },
    });
    sessionRef.current = session;
    try {
      const credentials =
        developmentToken.trim() === ''
          ? await requestLiveKitCredentials({ roomName, playerId, role })
          : { url: liveKitUrl.trim(), token: developmentToken.trim() };
      if (credentials.url === '') throw new Error('LiveKit Project URL を入力してください');
      await session.connect(credentials);
      if (role === 'PAY') {
        await session.setMicrophoneEnabled(false);
      }
    } catch (error) {
      sessionRef.current = null;
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setBusy(false);
    }
  }, [busy, developmentToken, liveKitUrl, playerId, role, roomName]);

  const toggleMicrophone = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (session === null) return;
    if (role === 'PAY') {
      if (wasshoiRef.current !== null) {
        stopPayInput();
        return;
      }
      try {
        const controller = await attachWasshoiInput(
          (event: WasshoiEvent) => {
            void session.sendWasshoi(event);
          },
          { onStatusChange: setPayMicStatus },
        );
        wasshoiRef.current = controller;
        setPayInputActive(true);
      } catch (error) {
        setSnapshot((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
      return;
    }
    try {
      await session.setMicrophoneEnabled(snapshot.microphone !== 'ON');
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [role, snapshot.microphone, stopPayInput]);

  const connected = snapshot.connection === 'CONNECTED' || snapshot.connection === 'RECONNECTING';
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-label="LiveKit voice debug">
        <p className={styles.eyebrow}>LIVEKIT CLOUD / ISSUE #82</p>
        <h1>Three Daisuke Voice Channel</h1>
        <p className={styles.description}>
          オドルノとオラは通常音声、Payは発話特徴だけをわっしょーいとして送信します。
        </p>

        {!connected && (
          <div className={styles.form}>
            <label>
              ROOM
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
            </label>
            <label>
              PLAYER ID
              <input value={playerId} onChange={(event) => setPlayerId(event.target.value)} />
            </label>
            <label>
              ROLE
              <select value={role} onChange={(event) => setRole(asVoiceRole(event.target.value))}>
                <option value="ODORUNO">ODORUNO</option>
                <option value="ORA">ORA</option>
                <option value="PAY">PAY</option>
              </select>
            </label>
            <label>
              LIVEKIT PROJECT URL
              <input
                value={liveKitUrl}
                placeholder="wss://…livekit.cloud"
                onChange={(event) => setLiveKitUrl(event.target.value)}
              />
            </label>
            <label>
              DEV TOKEN (この画面だけ)
              <input
                type="password"
                value={developmentToken}
                placeholder="Dashboard で作成した token"
                onChange={(event) => setDevelopmentToken(event.target.value)}
              />
            </label>
          </div>
        )}

        <dl className={styles.rows}>
          <Row label="LIVEKIT" value={snapshot.connection} />
          <Row label="ROOM" value={roomName} />
          <Row label="ROLE" value={role} />
          <Row label="MIC TRACK" value={snapshot.microphone} />
          {role === 'PAY' && <Row label="PAY MIC INPUT" value={payMicStatus.toUpperCase()} />}
          <Row label="WASSHOI DATA" value={connected ? 'CONNECTED' : 'IDLE'} />
        </dl>

        <section aria-label="participants">
          <h2>PARTICIPANTS ({snapshot.participants.length})</h2>
          <ul className={styles.participants}>
            {snapshot.participants.map((participant) => (
              <li key={participant.identity}>
                <span className={participant.isSpeaking ? styles.speaking : undefined}>
                  {participant.isSpeaking ? '● SPEAKING' : '○ QUIET'}
                </span>
                {participant.name}
              </li>
            ))}
          </ul>
        </section>

        <output className={styles.event} aria-label="最後のWasshoiEvent">
          {snapshot.lastWasshoiEvent === null
            ? 'LAST WASSHOI EVENT: —'
            : `LAST WASSHOI EVENT: ${snapshot.lastWasshoiEvent.durationMs}ms / ${snapshot.lastWasshoiEvent.intensity.toFixed(2)}`}
        </output>
        {snapshot.error !== null && <p className={styles.error}>{snapshot.error}</p>}

        {!connected ? (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? 'CONNECTING…' : 'ROOM に接続する'}
          </button>
        ) : (
          <>
            <button type="button" className={styles.button} onClick={() => void toggleMicrophone()}>
              {role === 'PAY'
                ? payInputActive
                  ? 'わっしょーい入力を停止する'
                  : 'わっしょーい入力を有効にする'
                : snapshot.microphone === 'ON'
                  ? 'マイクを OFF にする'
                  : 'マイクを ON にする'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void disconnect()}
            >
              ROOM から切断する
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
