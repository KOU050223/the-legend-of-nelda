import { useEffect, useState } from 'react';

import type { BarrierChallengeSnapshot } from '@/game/barrier/barrier-challenge';

import type { BarrierPresentationSnapshot } from './barrier-presentation-store';
import styles from './BarrierOverlay.module.css';

/** 発動演出を出しておく長さ。過ぎたら操作案内へ切り替える。 */
const CUTSCENE_MS = 4_200;

export type BarrierOverlayProps = BarrierPresentationSnapshot;

/**
 * ショートスリーパー結界のDOM演出と操作案内 (Issue #143)。
 *
 * 結界中はボスが無敵 (BOSS INVINCIBLE) になり、攻撃が一切通らなくなる。
 * 何も出さないと「攻撃が効かない = 壊れている」としか読めないので、
 * 発動を演出で見せてから、解除のやり方を出し続ける。
 *
 * docs/phase2-gameplay-spec.md §11 / §11.1。
 */
export function BarrierOverlay({
  challenge,
  localCharacterId,
}: BarrierOverlayProps): React.JSX.Element | null {
  const phase = challenge?.phase ?? null;

  if (challenge === null) return null;

  // 結界ごとに演出を出し直す。key を変えて作り直すので、尺の管理は
  // BarrierCutscene 自身の中だけで完結する。
  return <BarrierBody key={phase} challenge={challenge} localCharacterId={localCharacterId} />;
}

function BarrierBody({
  challenge,
  localCharacterId,
}: {
  challenge: BarrierChallengeSnapshot;
  localCharacterId: BarrierPresentationSnapshot['localCharacterId'];
}): React.JSX.Element {
  // 演出の尺はこのコンポーネントだけで測る。GAME では Authority が戦闘状態を
  // 持っているので、表示の都合で戦闘側を進めてはいけない。
  const [cutsceneDone, setCutsceneDone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setCutsceneDone(true), CUTSCENE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!cutsceneDone) return <BarrierCutscene phase={challenge.phase} />;

  return (
    <section className={styles.overlay} aria-live="polite">
      <BarrierGuide challenge={challenge} localCharacterId={localCharacterId} />
    </section>
  );
}

/** 発動の瞬間。ボスが無敵になったことを、攻撃が通らなくなる前に伝える。 */
function BarrierCutscene({ phase }: { phase: BarrierChallengeSnapshot['phase'] }) {
  return (
    <section className={`${styles.overlay} ${styles.cutscene}`} aria-live="assertive">
      <div className={styles.cutsceneInner}>
        <div className={styles.scanlines} />
        <p className={styles.shout}>「睡眠時間など4時間で十分だ！！！」</p>
        <div className={styles.titleCard}>
          <p className={styles.katakana}>ショートスリーパー結界</p>
          <h1 className={styles.invincible}>BOSS INVINCIBLE</h1>
          <p className={styles.lead}>
            {phase === 'BARRIER_1'
              ? '堀大輔の周囲に結界が張られた。攻撃は通らない。'
              : '再び結界。3人で散ってオレンジの円へ入れ。'}
          </p>
        </div>
        <p className={styles.callToAction}>オレンジの円に3人で入れ！</p>
      </div>
    </section>
  );
}

const DEVICE_LABELS: Record<string, string> = {
  DEVICE_0: '円 I',
  DEVICE_1: '円 II',
  DEVICE_2: '円 III',
};

const DEVICE_STATUS_LABELS: Record<BarrierChallengeSnapshot['devices'][number]['status'], string> =
  {
    IDLE: '空いている',
    OCCUPIED: '誰かいる',
  };

function BarrierGuide({
  challenge,
  localCharacterId,
}: {
  challenge: BarrierChallengeSnapshot;
  localCharacterId: BarrierPresentationSnapshot['localCharacterId'];
}): React.JSX.Element {
  const total = challenge.devices.length;

  return (
    <div className={styles.guide}>
      <div className={styles.guideHeader}>
        <span className={styles.badge}>BOSS INVINCIBLE</span>
        <strong className={styles.guideTitle}>オレンジの円に入って結界を解け</strong>
        <span className={styles.progress} aria-label="埋まっている円">
          {challenge.occupiedCount} / {total}
        </span>
      </div>

      <div className={styles.role}>
        <strong className={styles.roleAction}>オレンジの光の柱へ走って、中に立つ</strong>
        <span className={styles.roleDetail}>
          {localCharacterId === 'PAY'
            ? '装置の足元のオレンジの円が目印 (水色の安全地帯ではない)。3人が別々の円に入ると解除。'
            : '装置の足元のオレンジの円が目印 (水色の安全地帯ではない)。3人が別々の円に入ると解除。'}
        </span>
      </div>

      <ol className={styles.devices} aria-label="円の状態">
        {challenge.devices.map((device) => (
          <li
            key={device.id}
            className={`${styles.device} ${
              device.status === 'OCCUPIED' ? styles.deviceActivated : ''
            }`}
          >
            <span className={styles.deviceName}>{DEVICE_LABELS[device.id]}</span>
            <span className={styles.deviceStatus}>{DEVICE_STATUS_LABELS[device.status]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
