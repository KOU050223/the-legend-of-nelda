import { useEffect, useState } from 'react';

import type { BarrierChallengeSnapshot } from '@/game/barrier/barrier-challenge';
import type { CharacterId } from '@/game/config/phase2-player-balance';

import type { BarrierPresentationSnapshot } from './barrier-presentation-store';
import styles from './BarrierOverlay.module.css';

/** 発動演出を出しておく長さ。過ぎたら操作案内へ切り替える。 */
const CUTSCENE_MS = 4_200;

/** 「間違えた」を出しておく長さ。 */
const RESET_MS = 1_600;

export type BarrierOverlayProps = BarrierPresentationSnapshot;

/**
 * ショートスリーパー結界のDOM演出と操作案内 (Issue #143)。
 *
 * 結界中はボスが無敵 (BOSS INVINCIBLE) になり、攻撃が一切通らなくなる。
 * 何も出さないと「攻撃が効かない = 壊れている」としか読めないので、
 * 発動を演出で見せてから、解除のやり方を役割ごとに出し続ける。
 *
 * docs/phase2-gameplay-spec.md §11 / §11.1。
 */
export function BarrierOverlay({
  challenge,
  localCharacterId,
  resetSequence,
}: BarrierOverlayProps): React.JSX.Element | null {
  const phase = challenge?.phase ?? null;

  if (challenge === null) return null;

  // 結界ごとに演出を出し直す。key を変えて作り直すので、尺の管理は
  // BarrierCutscene 自身の中だけで完結する。
  return (
    <BarrierBody
      key={phase}
      challenge={challenge}
      localCharacterId={localCharacterId}
      resetSequence={resetSequence}
    />
  );
}

function BarrierBody({
  challenge,
  localCharacterId,
  resetSequence,
}: {
  challenge: BarrierChallengeSnapshot;
  localCharacterId: CharacterId | null;
  resetSequence: number;
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
      {resetSequence > 0 && <ResetNotice key={resetSequence} />}
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
              : '再び結界。今度は起動する順番がある。'}
          </p>
        </div>
        <p className={styles.callToAction}>3人で結界装置を起動しろ！</p>
      </div>
    </section>
  );
}

interface RoleGuide {
  readonly role: string;
  readonly action: string;
  readonly detail: string;
}

/**
 * 役割ごとの解除手順。§11.1 の3人の能力をそのまま操作へ落とす。
 *
 * 結界装置は ODORUNO が INTERACT で確保し、同じ装置を ORA が専用入力で
 * 起動する、の2手で1台進む (barrier-challenge.ts)。
 */
const ROLE_GUIDES: Record<CharacterId, RoleGuide> = {
  ODORUNO: {
    role: 'オドルノ大輔',
    action: '装置へ走り、E / INTERACT で現場を確保',
    detail: '確保したらオラ大輔に起動してもらう。2人で1台ずつ進める。',
  },
  ORA: {
    role: 'オラ大輔',
    action: '確保された装置の前で、オラ大輔専用入力で起動',
    detail: 'オドルノ大輔が確保した装置と同じ装置の前に立つこと。',
  },
  PAY: {
    role: 'Pay大輔',
    action: '仲間へ次に触る装置を伝える',
    detail: '起動順を間違えると最初からやり直しになる。声で誘導しよう。',
  },
};

function BarrierGuide({
  challenge,
  localCharacterId,
}: {
  challenge: BarrierChallengeSnapshot;
  localCharacterId: CharacterId | null;
}): React.JSX.Element {
  const guide = localCharacterId === null ? null : ROLE_GUIDES[localCharacterId];
  const total = challenge.phase === 'BARRIER_1' ? 1 : 3;

  return (
    <div className={styles.guide}>
      <div className={styles.guideHeader}>
        <span className={styles.badge}>BOSS INVINCIBLE</span>
        <strong className={styles.guideTitle}>結界装置を起動して解除しろ</strong>
        <span className={styles.progress} aria-label="起動済みの装置">
          {challenge.nextStepIndex} / {total}
        </span>
      </div>

      {guide !== null && (
        <div className={styles.role}>
          <span className={styles.roleName}>{guide.role}</span>
          <strong className={styles.roleAction}>{guide.action}</strong>
          <span className={styles.roleDetail}>{guide.detail}</span>
        </div>
      )}

      <ol className={styles.devices} aria-label="結界装置の状態">
        {challenge.devices.map((device) => (
          <li
            key={device.id}
            className={`${styles.device} ${
              device.status === 'ACTIVATED'
                ? styles.deviceActivated
                : device.status === 'SECURED'
                  ? styles.deviceSecured
                  : ''
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

const DEVICE_LABELS: Record<string, string> = {
  DEVICE_0: '装置 I',
  DEVICE_1: '装置 II',
  DEVICE_2: '装置 III',
};

const DEVICE_STATUS_LABELS: Record<BarrierChallengeSnapshot['devices'][number]['status'], string> =
  {
    IDLE: '未操作',
    SECURED: '確保 → 起動待ち',
    ACTIVATED: '起動済み',
  };

/** 手順を間違えたことを出す。無言で戻ると「壊れた」と読まれる。 */
function ResetNotice(): React.JSX.Element {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), RESET_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return <></>;

  return (
    <output className={styles.reset} aria-live="assertive">
      順番が違う！
      <small>装置がすべて戻った。最初からやり直そう</small>
    </output>
  );
}
