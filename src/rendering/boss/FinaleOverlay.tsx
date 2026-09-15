import type { BossPhase } from '@/game/boss/boss-phase';
import type { FinaleState } from '@/game/finale/finale-state';

import styles from './FinaleOverlay.module.css';

export interface FinaleOverlayProps {
  readonly phase: BossPhase;
  readonly finale: FinaleState;
  /** 同じ文言を再生し直すための連番。0なら表示しない。 */
  readonly zeroDamageSequence: number;
}

/** 最終局面のDOM演出。Canvas上の3D表示とは分け、文字の可読性を優先する。 */
export function FinaleOverlay({
  phase,
  finale,
  zeroDamageSequence,
}: FinaleOverlayProps): React.JSX.Element | null {
  const noSleepMode = phase === 'NO_SLEEP_MODE';
  if (!noSleepMode) return null;

  if (finale === 'NONE') {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.noSleep}>
          <div className={styles.scanlines} />
          <p className={styles.warning}>⚠ WARNING ⚠ ﾃﾞｰｰｰﾝ!!! ⚠ WARNING ⚠</p>
          <p className={styles.boot}>SLEEP SYSTEM / EMERGENCY OVERRIDE / EXECUTING...</p>
          <div className={styles.titleCard}>
            <p className={styles.katakana}>アルティメットスリーピングキャンセルモード</p>
            <h1 className={styles.absolute}>絶対に寝ない</h1>
            <div className={styles.stats} aria-label="最終形態の補助ステータス">
              <span>睡眠欲</span>
              <span>0%</span>
              <span>眠気</span>
              <span>0%</span>
              <span>カフェイン</span>
              <span>999%</span>
            </div>
          </div>
        </div>
        {zeroDamageSequence > 0 && <ZeroDamage key={zeroDamageSequence} />}
      </section>
    );
  }

  if (finale === 'FINAL_STANDOFF') {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.cinematic}>
          <p className={styles.chapter}>FINAL STANDOFF</p>
          <p className={styles.line}>
            「……無駄だ。」
            <br />
            「どれだけ攻撃しようと――」
            <br />
            「俺は眠らない。」
          </p>
        </div>
        {zeroDamageSequence > 0 && <ZeroDamage key={zeroDamageSequence} />}
      </section>
    );
  }

  if (finale === 'OCARINA_APPEARING' || finale === 'WAITING_FOR_MELODY') {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.ocarina}>
          {finale === 'OCARINA_APPEARING' ? (
            <p>……空から、何かが降りてくる。</p>
          ) : (
            <>
              <p>
                伝説のオカリナが
                <br />
                あなたたちに応えている……
              </p>
              <strong>伝説のオカリナを奏でよ</strong>
            </>
          )}
        </div>
        {zeroDamageSequence > 0 && <ZeroDamage key={zeroDamageSequence} />}
      </section>
    );
  }

  return null;
}

function ZeroDamage(): React.JSX.Element {
  return (
    <output className={styles.zeroDamage} aria-live="assertive">
      0 DAMAGE
      <small>※寝る気がないため効果がありません</small>
    </output>
  );
}
