import { useEffect, useState } from 'react';

import type { AttackId } from '@/game/config/combat-balance';
import type { EventFeedback } from '@/store/game-store';
import { useGameStore } from '@/store/game-store';
import { TutorialGuide } from '@/ui/tutorial/TutorialGuide';

import type { HudLayer, HudProps } from './hud-layers';
import styles from './Hud.module.css';

const DEFAULT_EVENT_DURATION_MS = 1_200;

function isLayerVisible(layer: HudLayer, layers: HudProps['layers']): boolean {
  return layers?.[layer] !== false;
}

/** 被弾の文言は技ごとに変える。docs/single-player-poc-spec.md §6。 */
function hitMessageFor(attackId: AttackId | null): string {
  if (attackId === 'YAWN_WAVE') return 'DROWSY!';
  if (attackId === 'FLUFFY_FUTON') return 'GOOD NIGHT';
  return 'HIT';
}

/**
 * 表示イベントを文言へ移す。入力はこの1つの値だけなので、
 * 別々の State を突き合わせて文言が変わることがない (UI-008)。
 */
function eventMessageFor(feedback: EventFeedback | null): string | null {
  if (feedback === null) return null;

  switch (feedback.kind) {
    case 'COUNTER':
      return 'COUNTER!';
    case 'REJECTION':
      return feedback.reason === 'TOO_EARLY' ? 'TOO EARLY' : 'WHIFF';
    case 'RESULT':
      switch (feedback.result) {
        case 'PERFECT_DODGE':
          return 'PERFECT DODGE';
        case 'JUST_GUARD':
          return 'JUST GUARD';
        case 'TOO_EARLY':
          return 'TOO EARLY';
        case 'HIT':
        case 'MISS':
          return hitMessageFor(feedback.attackId);
        default:
          return null;
      }
    default:
      return null;
  }
}

/** ゲージの割合。上限は戦闘生成時の設定値を使うので、既定値へ固定しない。 */
function percentOf(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.min(100, Math.max(0, (value / maximum) * 100));
}

function EventMessage({
  message,
  durationMs,
}: {
  message: string;
  durationMs: number;
}): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsVisible(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs]);

  if (!isVisible) return null;

  return (
    <output className={styles.eventMessage} aria-live="polite">
      {message}
    </output>
  );
}

/**
 * HUD は React DOM で Canvas へ重ねる。3D Scene 内へは配置しない。
 * (docs/technical-design.md §5.5 / §14)
 */
export function Hud({
  layers,
  eventDurationMs = DEFAULT_EVENT_DURATION_MS,
}: HudProps): React.JSX.Element {
  const bossHp = useGameStore((state) => state.bossHp);
  const bossHpMax = useGameStore((state) => state.bossHpMax);
  const sleepiness = useGameStore((state) => state.sleepiness);
  const sleepinessMax = useGameStore((state) => state.sleepinessMax);
  const lastAction = useGameStore((state) => state.lastAction);
  const eventFeedback = useGameStore((state) => state.eventFeedback);
  const eventSequence = useGameStore((state) => state.eventSequence);

  const eventMessage = eventMessageFor(eventFeedback);
  // 上限は設定で変えられるため、表示は常に割合へ直してから丸める。
  const sleepinessPercent = Math.round(percentOf(sleepiness, sleepinessMax));

  return (
    <div className={styles.hud}>
      {isLayerVisible('BOSS_HP', layers) && (
        <div className={styles.bossBar}>
          <span className={styles.label}>SLEEP DEMON</span>
          <div className={styles.gauge}>
            <div
              className={styles.gaugeFill}
              style={{ width: `${percentOf(bossHp, bossHpMax)}%` }}
            />
          </div>
        </div>
      )}

      {isLayerVisible('SLEEPINESS', layers) && (
        <div className={styles.sleepiness}>
          <span className={styles.label}>HORI SLEEPINESS</span>
          <span className={styles.value}>
            <span>{sleepinessPercent}</span>
            <span aria-hidden="true">%</span>
          </span>
        </div>
      )}

      {isLayerVisible('TUTORIAL_UI', layers) && <TutorialGuide />}

      {isLayerVisible('EVENT_UI', layers) && eventMessage !== null && (
        <EventMessage
          key={`${eventMessage}-${eventSequence}`}
          message={eventMessage}
          durationMs={eventDurationMs}
        />
      )}

      {isLayerVisible('ACTION_UI', layers) && (
        <div className={styles.actionGuide}>
          <span>← / A DODGE LEFT</span>
          <span>→ / D DODGE RIGHT</span>
          <span>↓ / S GUARD</span>
          <span>SPACE / J ATTACK</span>
          <span className={styles.lastAction}>{lastAction ?? 'READY'}</span>
        </div>
      )}
    </div>
  );
}
