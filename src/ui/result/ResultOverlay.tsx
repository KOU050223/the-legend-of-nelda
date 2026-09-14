import { useGameStore } from '@/store/game-store';
import { RESULT_TIMING } from './result-presentation';
import styles from './ResultOverlay.module.css';

export function ResultOverlay({ onRestart }: { onRestart: () => void }): React.JSX.Element | null {
  const result = useGameStore((state) => state.result);
  if (!result) return null;
  const victory = result.outcome === 'victory';
  return (
    <section
      className={`${styles.overlay} ${victory ? styles.victory : styles.defeat}`}
      aria-label={victory ? '勝利' : '敗北'}
    >
      <div className={styles.flash} />
      <div className={styles.letterbox} />
      <p className={styles.verdict}>
        {victory ? 'THE FINAL AWAKENING' : 'HORI SLEEPINESS 100%'}{' '}
        <span> — {victory ? '決着' : '意識、消失'}</span>
      </p>
      {result.elapsedMs >= RESULT_TIMING.title && (
        <div className={styles.title} aria-live="polite">
          <p className={styles.chapter}>
            {victory ? '眠りとの戦いに、終止符。' : '世界の命運は、まぶたに託された。'}
          </p>
          <h1>{victory ? 'SLEEP DEMON DEFEATED' : 'HORI FELL ASLEEP'}</h1>
          <div className={styles.rule} />
          {result.elapsedMs >= RESULT_TIMING.subtitle && (
            <div className={styles.subtitle}>
              <p>{victory ? 'WAKE FORCE COMPLETE' : 'Zzz...'}</p>
              <span>
                {victory
                  ? 'そして勇者は、二度寝を許さなかった。'
                  : '勇者はただ、あと5分だけ眠りたかった。'}
              </span>
            </div>
          )}
        </div>
      )}
      {result.elapsedMs >= RESULT_TIMING.restart && (
        <button className={styles.restart} onClick={onRestart}>
          RESTART <span>もう一度、目を覚ませ</span>
        </button>
      )}
    </section>
  );
}
