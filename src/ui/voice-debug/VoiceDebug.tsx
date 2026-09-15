import type { VoiceRole, VoiceSessionSnapshot } from '@/voice/livekit-voice-session';

import styles from './VoiceDebug.module.css';
import { useVoiceDebugSession, type VoiceDebugSession } from './use-voice-debug-session';

function asVoiceRole(value: string): VoiceRole {
  if (value === 'ORA' || value === 'PAY') return value;
  return 'ODORUNO';
}

/** Issue #82 の複数ブラウザ手動確認用。通常ゲーム画面に常駐させない。 */
export function VoiceDebug(): React.JSX.Element {
  const voice = useVoiceDebugSession();

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-label="LiveKit voice debug">
        <VoiceHeader />
        {!voice.connected && <VoiceConfiguration voice={voice} />}
        <VoiceStatus voice={voice} />
        <VoiceControls voice={voice} />
      </section>
    </main>
  );
}

function VoiceHeader(): React.JSX.Element {
  return (
    <>
      <p className={styles.eyebrow}>LIVEKIT CLOUD / ISSUE #82</p>
      <h1>Three Daisuke Voice Channel</h1>
      <p className={styles.description}>
        オドルノとオラは通常音声、Payは発話特徴だけをわっしょーいとして送信します。
      </p>
    </>
  );
}

function VoiceConfiguration({ voice }: { voice: VoiceDebugSession }): React.JSX.Element {
  return (
    <div className={styles.form}>
      <TextField
        label="ROOM"
        value={voice.roomName}
        onChange={(value) => voice.setRoomName(value)}
      />
      <TextField
        label="PLAYER ID"
        value={voice.playerId}
        onChange={(value) => voice.setPlayerId(value)}
      />
      <label>
        ROLE
        <select
          value={voice.role}
          onChange={(event) => voice.setRole(asVoiceRole(event.target.value))}
        >
          <option value="ODORUNO">ODORUNO</option>
          <option value="ORA">ORA</option>
          <option value="PAY">PAY</option>
        </select>
      </label>
      <TextField
        label="LIVEKIT PROJECT URL"
        value={voice.liveKitUrl}
        placeholder="wss://…livekit.cloud"
        onChange={(value) => voice.setLiveKitUrl(value)}
      />
      <TextField
        label="DEV TOKEN (この画面だけ)"
        value={voice.developmentToken}
        placeholder="Dashboard で作成した token"
        type="password"
        onChange={(value) => voice.setDevelopmentToken(value)}
      />
      <TextField
        label="DEVELOPMENT TOKEN SERVER ID"
        value={voice.developmentTokenServerId}
        placeholder="token-server-…"
        onChange={(value) => voice.setDevelopmentTokenServerId(value)}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'password' | 'text';
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function VoiceStatus({ voice }: { voice: VoiceDebugSession }): React.JSX.Element {
  return (
    <>
      <dl className={styles.rows}>
        <Row label="LIVEKIT" value={voice.snapshot.connection} />
        <Row label="ROOM" value={voice.roomName} />
        <Row label="ROLE" value={voice.role} />
        <Row label="MIC TRACK" value={voice.snapshot.microphone} />
        {voice.role === 'PAY' && (
          <Row label="PAY MIC INPUT" value={voice.payMicStatus.toUpperCase()} />
        )}
        <Row label="WASSHOI DATA" value={voice.connected ? 'CONNECTED' : 'IDLE'} />
      </dl>
      <ParticipantList snapshot={voice.snapshot} />
      <output className={styles.event} aria-label="最後のWasshoiEvent">
        {voice.snapshot.lastWasshoiEvent === null
          ? 'LAST WASSHOI EVENT: —'
          : `LAST WASSHOI EVENT: ${voice.snapshot.lastWasshoiEvent.durationMs}ms / ${voice.snapshot.lastWasshoiEvent.intensity.toFixed(2)}`}
      </output>
      {voice.snapshot.error !== null && <p className={styles.error}>{voice.snapshot.error}</p>}
    </>
  );
}

function ParticipantList({ snapshot }: { snapshot: VoiceSessionSnapshot }): React.JSX.Element {
  return (
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
  );
}

function VoiceControls({ voice }: { voice: VoiceDebugSession }): React.JSX.Element {
  if (!voice.connected) return <DisconnectedControls voice={voice} />;
  return <ConnectedControls voice={voice} />;
}

function DisconnectedControls({ voice }: { voice: VoiceDebugSession }): React.JSX.Element {
  return (
    <>
      <p className={styles.tokenServerNote}>
        Development Token Server は開発専用です。発行後に ROOM へ接続してください。
      </p>
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={voice.busy}
        onClick={() => void voice.issueDevelopmentToken()}
      >
        {voice.busy ? 'ISSUING…' : '開発用 token を発行する'}
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={voice.busy}
        onClick={() => void voice.connect()}
      >
        {voice.busy ? 'CONNECTING…' : 'ROOM に接続する'}
      </button>
    </>
  );
}

function ConnectedControls({ voice }: { voice: VoiceDebugSession }): React.JSX.Element {
  return (
    <>
      <button type="button" className={styles.button} onClick={() => void voice.toggleMicrophone()}>
        <MicrophoneButtonLabel voice={voice} />
      </button>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => void voice.disconnect()}
      >
        ROOM から切断する
      </button>
    </>
  );
}

function MicrophoneButtonLabel({ voice }: { voice: VoiceDebugSession }): string {
  if (voice.role !== 'PAY')
    return voice.snapshot.microphone === 'ON' ? 'マイクを OFF にする' : 'マイクを ON にする';
  return voice.payInputActive ? 'わっしょーい入力を停止する' : 'わっしょーい入力を有効にする';
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
