import type { BossPhase } from '@/game/boss/boss-phase';
import type { FinaleState } from '@/game/finale/finale-state';
import type { MicrophoneInputStatus } from '@/input/microphone/types';
import { useState } from 'react';

import styles from './FinaleOverlay.module.css';

const SHEET_NOTES = ['ド-1', 'ミ-1', 'ソ', 'ミ-2', 'ド-2', 'ソ-2'] as const;

export interface FinaleOverlayProps {
  readonly phase: BossPhase;
  readonly finale: FinaleState;
  /** 同じ文言を再生し直すための連番。0なら表示しない。 */
  readonly zeroDamageSequence: number;
  readonly microphoneStatus: MicrophoneInputStatus;
}

/** 最終局面のDOM演出。Canvas上の3D表示とは分け、文字の可読性を優先する。 */
export function FinaleOverlay({
  phase,
  finale,
  zeroDamageSequence,
  microphoneStatus,
}: FinaleOverlayProps): React.JSX.Element | null {
  const [performing, setPerforming] = useState(false);
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
              {performing ? (
                <SheetMusic microphoneStatus={microphoneStatus} />
              ) : (
                <>
                  <p>
                    伝説のオカリナが
                    <br />
                    あなたたちに応えている……
                  </p>
                  <strong>伝説のオカリナを奏でよ</strong>
                  <button
                    className={styles.startMelody}
                    type="button"
                    onClick={() => {
                      setPerforming(true);
                      window.dispatchEvent(new Event('finale:melody-start'));
                    }}
                  >
                    演奏を始める
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {zeroDamageSequence > 0 && <ZeroDamage key={zeroDamageSequence} />}
      </section>
    );
  }

  return null;
}

function SheetMusic({
  microphoneStatus,
}: {
  microphoneStatus: MicrophoneInputStatus;
}): React.JSX.Element {
  return (
    <section className={styles.sheet} aria-label="安眠の旋律の楽譜">
      <p className={styles.sheetTitle}>安眠の旋律を吹け！</p>
      <div className={styles.staff}>
        <span className={styles.clef}>𝄞</span>
        {SHEET_NOTES.map((entry) => (
          <span className={styles.note} key={entry}>
            {entry.split('-')[0]}
          </span>
        ))}
      </div>
      <p className={styles.sheetHint}>{microphoneMessage(microphoneStatus)}</p>
    </section>
  );
}

function microphoneMessage(status: MicrophoneInputStatus): string {
  switch (status) {
    case 'requesting-permission':
      return 'マイクを準備中……許可してください';
    case 'active':
      return 'マイク入力を検知中。ゆっくり奏でよう';
    case 'permission-denied':
      return 'マイクが許可されていません。ブラウザの設定から許可してください';
    case 'device-not-found':
      return 'マイクが見つかりません';
    case 'error':
      return 'マイク入力を開始できませんでした。接続を確認してください';
    case 'idle':
      return 'マイクを開始しています……';
    default:
      return 'マイクを開始しています……';
  }
}

function ZeroDamage(): React.JSX.Element {
  return (
    <output className={styles.zeroDamage} aria-live="assertive">
      0 DAMAGE
      <small>※寝る気がないため効果がありません</small>
    </output>
  );
}
