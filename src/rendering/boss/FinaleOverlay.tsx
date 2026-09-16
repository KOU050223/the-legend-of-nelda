import type { BossPhase } from '@/game/boss/boss-phase';
import type { FinaleState } from '@/game/finale/finale-state';
import type { MicrophoneInputStatus } from '@/input/microphone/types';
import type { NoteName } from '@/input/microphone/types';
import { useEffect, useState } from 'react';

import horiMemory1 from '../../../assets/character/hori-daisuke-v1/source/daisuke_hori1.png';
import horiMemory2 from '../../../assets/character/hori-daisuke-v1/source/daisuke_hori2.png';
import horiMemory3 from '../../../assets/character/hori-daisuke-v1/source/daisuke_hori3.png';
import horiMemory4 from '../../../assets/character/hori-daisuke-v1/source/daisuke_hori4.png';
import horiSleepingMovie from '../../../assets/character/hori-daisuke-v1/source/daisuke_hori_SleepingMovie.mov';
import { useScreenStore } from '@/app/screen';

import { requestOcarinaClaim, type PlayedMelodyNote } from './finale-presentation-store';
import styles from './FinaleOverlay.module.css';

export interface FinaleOverlayProps {
  readonly phase: BossPhase;
  readonly finale: FinaleState;
  readonly localPlayerId: string;
  readonly ocarinaPerformerId: string | null;
  /** 同じ文言を再生し直すための連番。0なら表示しない。 */
  readonly zeroDamageSequence: number;
  readonly microphoneStatus: MicrophoneInputStatus;
  readonly playedMelodyNotes: readonly PlayedMelodyNote[];
  readonly melodyMissSequence: number;
  readonly melodyExpected: NoteName | null;
  readonly showMelodyHint: boolean;
}

/** 最終局面のDOM演出。Canvas上の3D表示とは分け、文字の可読性を優先する。 */
export function FinaleOverlay({
  phase,
  finale,
  localPlayerId,
  ocarinaPerformerId,
  zeroDamageSequence,
  microphoneStatus,
  playedMelodyNotes,
  melodyMissSequence,
  melodyExpected,
  showMelodyHint,
}: FinaleOverlayProps): React.JSX.Element | null {
  const [performing, setPerforming] = useState(false);
  const noSleepMode = phase === 'NO_SLEEP_MODE';
  if (!noSleepMode) return null;

  if (finale === 'NONE') {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.noSleep}>
          <div className={styles.scanlines} />
          <p className={styles.warning}>⚠ WARNING　絶対に寝ないモード発動 ⚠</p>
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

  if (finale === 'MELODY_ACCEPTED') {
    return <MelodyAccepted />;
  }

  if (finale === 'MEMORY') {
    return <MemoryReel />;
  }

  if (finale === 'HORI_FALLING_ASLEEP') {
    return <HoriFallingAsleep />;
  }

  if (finale === 'ENDING') {
    return <Ending />;
  }

  if (finale === 'OCARINA_APPEARING' || finale === 'WAITING_FOR_MELODY') {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={`${styles.ocarina} ${performing ? styles.ocarinaPerforming : ''}`}>
          {finale === 'OCARINA_APPEARING' ? (
            <div className={styles.ocarinaPrompt}>
              <p>……空から、何かが降りてくる。</p>
            </div>
          ) : (
            <>
              {performing && ocarinaPerformerId === localPlayerId ? (
                <SheetMusic
                  microphoneStatus={microphoneStatus}
                  playedNotes={playedMelodyNotes}
                  missSequence={melodyMissSequence}
                  expectedNote={melodyExpected}
                  showNextHint={showMelodyHint}
                />
              ) : ocarinaPerformerId === null ? (
                <div className={styles.ocarinaPrompt}>
                  <p>
                    伝説のオカリナが
                    <br />
                    あなたたちに応えている……
                  </p>
                  <strong>最初にオカリナを取れ</strong>
                  <button
                    className={styles.startMelody}
                    type="button"
                    onClick={() => {
                      requestOcarinaClaim();
                    }}
                  >
                    オカリナを取る
                  </button>
                </div>
              ) : ocarinaPerformerId === localPlayerId ? (
                <div className={styles.ocarinaPrompt}>
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
                </div>
              ) : (
                <div className={styles.ocarinaPrompt}>
                  <p>仲間が伝説のオカリナを手に取った。</p>
                  <strong>演奏を見守ろう</strong>
                </div>
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

/** 旋律完成の一瞬だけ、画面を止めたように見せて回想へ繋ぐ。 */
function MelodyAccepted(): React.JSX.Element {
  return (
    <section className={`${styles.overlay} ${styles.melodyAccepted}`} aria-live="assertive">
      <div className={styles.melodyFlash} />
      <p className={styles.melodySmall}>THE LEGENDARY MELODY HAS BEEN PLAYED</p>
      <h1 className={styles.melodyTitle}>安 眠 の 旋 律</h1>
      <p className={styles.melodyLine}>「……この音は……？」</p>
    </section>
  );
}

/**
 * 回想の写真・文言はこの配列だけ差し替えれば素材更新できる。
 * 現時点では既存の堀大輔写真を仮素材として使い、演出の尺と遷移を先に成立させる。
 */
const MEMORY_STILLS = [
  {
    src: horiMemory1,
    caption: '「彼にもかつて――」',
    detail: '「目を閉じる、という習慣があった。」',
    archive: 'SLEEP ARCHIVE / KITCHEN / 20:14',
  },
  {
    src: horiMemory2,
    caption: '「あの日も――」',
    detail: '「食卓に、静かな眠りがあった。」',
    archive: 'SLEEP ARCHIVE / TABLE / 20:15',
  },
  {
    src: horiMemory3,
    caption: '「この日も――」',
    detail: '「ソファに身をあずけていた。」',
    archive: 'SLEEP ARCHIVE / SOFA / 22:47',
  },
  {
    src: horiMemory4,
    caption: '「そして彼は――」',
    detail: '「眠っていた。」',
    archive: 'SLEEP ARCHIVE / MAXIMUM SLEEP',
  },
] as const;

function MemoryReel(): React.JSX.Element {
  const [stillIndex, setStillIndex] = useState(0);
  const still = MEMORY_STILLS[stillIndex];

  useEffect(() => {
    if (stillIndex >= MEMORY_STILLS.length - 1) return undefined;

    const timer = window.setTimeout(() => setStillIndex((current) => current + 1), 3_350);
    return () => window.clearTimeout(timer);
  }, [stillIndex]);

  if (still === undefined) return <></>;

  return (
    <section className={`${styles.overlay} ${styles.memory}`} aria-live="polite">
      <div className={styles.memoryLightLeak} />
      <p className={styles.memoryChapter}>MEMORY OF SLEEP</p>
      <figure className={styles.memoryStill} key={still.src}>
        <img src={still.src} alt="堀大輔の過去の睡眠の記憶" />
        <figcaption>
          <span>{still.caption}</span>
          <strong>{still.detail}</strong>
        </figcaption>
        <small>{still.archive}</small>
      </figure>
      <div className={styles.memoryCounter} aria-label={`回想 ${stillIndex + 1} 枚目`}>
        <span>◉ REC</span>
        <b>
          {String(stillIndex + 1).padStart(2, '0')} /{' '}
          {String(MEMORY_STILLS.length).padStart(2, '0')}
        </b>
      </div>
      {stillIndex === MEMORY_STILLS.length - 1 && (
        <p className={styles.memoryRealization}>
          「そうか……。」
          <br />
          「俺は……眠ることを、忘れていたのか。」
        </p>
      )}
    </section>
  );
}

function HoriFallingAsleep(): React.JSX.Element {
  return (
    <section className={`${styles.overlay} ${styles.sleeping}`} aria-live="assertive">
      <p className={styles.sleepingLine}>「……眠い。」</p>
      <p className={styles.sleepingHint}>……布団が、静かにめくられた。</p>
      <p className={styles.sleepingZzz}>Zzz...</p>
    </section>
  );
}

function Ending(): React.JSX.Element {
  const goTo = useScreenStore((state) => state.goTo);
  const [creditsRolling, setCreditsRolling] = useState(false);
  const [showFinal, setShowFinal] = useState(false);

  useEffect(() => {
    // 「安眠が戻った」の余韻を残してから、下からではなく上からロールを始める。
    const startTimer = window.setTimeout(() => setCreditsRolling(true), 3_400);
    const endTimer = window.setTimeout(() => setShowFinal(true), 21_400);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
    };
  }, []);

  return (
    <section
      className={`${styles.overlay} ${styles.ending} ${showFinal ? styles.endingSkipped : ''}`}
      aria-live="polite"
    >
      <video
        className={styles.endingMovie}
        src={horiSleepingMovie}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className={styles.endingShade} />
      <div className={styles.endingIntro}>
        <p className={styles.endingPrologue}>こうして世界に――</p>
        <p className={styles.endingLine}>安眠が戻った。</p>
      </div>
      <div className={styles.creditsViewport} aria-label="スタッフロール">
        <div className={`${styles.credits} ${creditsRolling ? styles.creditsRolling : ''}`}>
          <p>THE LEGEND OF NELDA</p>
          <strong>END CREDITS</strong>
          <p>CAST</p>
          <strong>堀大輔　as　眠りを思い出した男</strong>
          <strong>オドルノ大輔　as　伝説を奏でた者</strong>
          <strong>PayPay大輔　as　見守る仲間</strong>
          <strong>オラオラ大輔　as　見守る仲間</strong>
          <p>ORIGINAL STORY</p>
          <strong>堀大輔が眠るまで</strong>
          <p>GAME DESIGN</p>
          <strong>眠気と根性の境界線</strong>
          <p>LEGENDARY OCARINA</p>
          <strong>現実世界で演奏してくれたあなた</strong>
          <p>3D CHARACTER ART</p>
          <strong>堀大輔、そして眠らない意思</strong>
          <p>CAMERA WORK</p>
          <strong>無駄に壮大な寄りと間</strong>
          <p>SLEEP CONSULTANT</p>
          <strong>布団</strong>
          <p>EMERGENCY FUTON DELIVERY</p>
          <strong>最終局面のどこからともなく</strong>
          <p>QUALITY ASSURANCE</p>
          <strong>寝る気がないため効果がありません</strong>
          <p>SPECIAL THANKS</p>
          <strong>すべての眠い人たち</strong>
          <strong>明日の自分</strong>
          <strong>そして、8時間の睡眠</strong>
        </div>
      </div>
      {creditsRolling && !showFinal && (
        <button className={styles.skipCredits} type="button" onClick={() => setShowFinal(true)}>
          エンドロールをスキップ
        </button>
      )}
      <div className={styles.endingFinal}>
        <div className={styles.endingTitleCenter}>
          <div className={styles.endingTitle}>
            <p>THE LEGEND OF NELDA</p>
            <h1>THE END</h1>
          </div>
        </div>
        <button
          className={styles.returnTitle}
          type="button"
          onClick={() => {
            goTo('TITLE');
          }}
        >
          タイトルに戻る
        </button>
      </div>
    </section>
  );
}

function SheetMusic({
  microphoneStatus,
  playedNotes,
  missSequence,
  expectedNote,
  showNextHint,
}: {
  microphoneStatus: MicrophoneInputStatus;
  playedNotes: readonly PlayedMelodyNote[];
  missSequence: number;
  expectedNote: NoteName | null;
  showNextHint: boolean;
}): React.JSX.Element {
  return (
    <section className={styles.sheet} aria-label="安眠の旋律の楽譜">
      <p className={styles.sheetTitle}>安眠の旋律を吹け！</p>
      <div className={`${styles.staff} ${missSequence > 0 ? styles.staffMiss : ''}`}>
        <span className={styles.clef}>𝄞</span>
        <div className={styles.noteTrack} aria-label="認識した音">
          {playedNotes.map((note) => (
            <span
              className={`${styles.note} ${note.correct ? styles.noteCorrect : styles.noteWrong} ${noteHeightClass(note.name)}`}
              key={note.id}
            >
              {noteNameLabel(note.name)}
            </span>
          ))}
        </div>
      </div>
      {missSequence > 0 && (
        <p className={styles.miss} key={missSequence}>
          ♪ その音じゃない！ もう一度！
        </p>
      )}
      {showNextHint && expectedNote !== null && (
        <p className={styles.melodyNext}>次：{noteNameLabel(expectedNote)}</p>
      )}
      <p className={styles.sheetHint}>{microphoneMessage(microphoneStatus)}</p>
    </section>
  );
}

function noteNameLabel(note: NoteName): string {
  const labels: Record<NoteName, string> = {
    C: 'ド',
    'C#': 'ド#',
    D: 'レ',
    'D#': 'レ#',
    E: 'ミ',
    F: 'ファ',
    'F#': 'ファ#',
    G: 'ソ',
    'G#': 'ソ#',
    A: 'ラ',
    'A#': 'ラ#',
    B: 'シ',
  };
  return labels[note];
}

function noteHeightClass(note: NoteName): string {
  switch (note) {
    case 'C':
      return styles.noteC ?? '';
    case 'D':
      return styles.noteD ?? '';
    case 'E':
      return styles.noteE ?? '';
    case 'F':
      return styles.noteF ?? '';
    case 'G':
      return styles.noteG ?? '';
    case 'A':
      return styles.noteA ?? '';
    case 'B':
      return styles.noteB ?? '';
    default:
      return styles.noteSharp ?? '';
  }
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
