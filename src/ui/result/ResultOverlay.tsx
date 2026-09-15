import { useGameStore } from '@/store/game-store';
import { getDefeatCinematicState } from '@/game/cinematic/defeat-cinematic';
import { DEFEAT_RESULT_TIMING, RESULT_TIMING } from './result-presentation';
import styles from './ResultOverlay.module.css';

export function ResultOverlay({ onRestart }: { onRestart: () => void }): React.JSX.Element | null {
  const result = useGameStore((state) => state.result);
  if (!result) return null;
  const victory = result.outcome === 'victory';
  const defeatState = victory ? null : getDefeatCinematicState(result.elapsedMs);
  return (
    <section
      className={`${styles.overlay} ${victory ? styles.victory : styles.defeat}`}
      aria-label={victory ? '勝利' : '敗北'}
    >
      <div className={styles.flash} />
      <div className={styles.letterbox} />
      {victory && (
        <p className={styles.verdict}>
          THE FINAL AWAKENING <span> — 決着</span>
        </p>
      )}
      {!victory && defeatState?.caption && (
        <p className={styles.caption} aria-live="polite">
          {defeatState.caption}
        </p>
      )}
      {victory && result.elapsedMs >= RESULT_TIMING.title && (
        <div className={styles.title} aria-live="polite">
          <p className={styles.chapter}>眠りとの戦いに、終止符。</p>
          <h1>SLEEP DEMON DEFEATED</h1>
          <div className={styles.rule} />
          {result.elapsedMs >= RESULT_TIMING.subtitle && (
            <div className={styles.subtitle}>
              <p>WAKE FORCE COMPLETE</p>
              <span>そして勇者は、二度寝を許さなかった。</span>
            </div>
          )}
        </div>
      )}
      {!victory && defeatState?.showBadEnd && (
        <div className={styles.title} aria-live="polite">
          <p className={styles.chapter}>世界の安眠が失われた。</p>
          <h1>BAD END</h1>
        </div>
      )}
      {((victory && result.elapsedMs >= RESULT_TIMING.restart) ||
        (!victory && result.elapsedMs >= DEFEAT_RESULT_TIMING.restart)) && (
        <button className={styles.restart} onClick={onRestart}>
          RESTART <span>もう一度、目を覚ませ</span>
        </button>
      )}
    </section>
  );
}
