import { useAppMultiplayerVoiceSession } from './MultiplayerVoiceSessionProvider';
import styles from './VoiceHud.module.css';

/** GAME中に接続・マイク・発話者だけを確認できる最小HUD。 */
export function VoiceHud(): React.JSX.Element | null {
  const voice = useAppMultiplayerVoiceSession();
  if (voice.context === null) return null;

  return (
    <aside className={styles.hud} aria-label="ボイスチャット状態">
      <span className={styles.title}>VOICE {voice.snapshot.connection}</span>
      <span className={styles.mode}>
        {voice.context.role === 'PAY' ? 'MIC: WASSHOI MODE' : `MIC: ${voice.snapshot.microphone}`}
      </span>
      {voice.context.role === 'PAY' && (
        <span className={styles.mode}>
          WASSHOI: {voice.payInputActive ? 'ACTIVE' : voice.payInputStatus.toUpperCase()}
        </span>
      )}
      {voice.snapshot.participants.map((participant) => (
        <span
          key={participant.identity}
          className={[styles.participant, participant.isSpeaking ? styles.speaking : ''].join(' ')}
        >
          {participant.name} {participant.isSpeaking ? '●' : '○'}
        </span>
      ))}
      {voice.snapshot.error !== null && <span className={styles.error}>VOICE ERROR</span>}
    </aside>
  );
}
