import { useEffect, useState } from 'react';

import { INITIAL_BOSS_HP } from '@/game/config/combat-balance';
import type { AttackId } from '@/game/config/combat-balance';
import type { CombatState, JudgeResult } from '@/game/types';
import type { InputRejectionReason } from '@/game/events/game-event';
import { useGameStore } from '@/store/game-store';

import styles from './Hud.module.css';

/** 将来の Role 別配信で独立して切り替える HUD の情報レイヤー。 */
export const HUD_LAYERS = ['BOSS_HP', 'SLEEPINESS', 'WAKE_FORCE', 'ACTION_UI', 'EVENT_UI'] as const;
export type HudLayer = (typeof HUD_LAYERS)[number];

export interface HudProps {
  /** false のレイヤーだけを非表示にする。指定しないレイヤーは表示する。 */
  layers?: Partial<Record<HudLayer, boolean>>;
  /** イベントフィードバックの表示時間。 */
  eventDurationMs?: number;
}

const DEFAULT_EVENT_DURATION_MS = 1_200;

function isLayerVisible(layer: HudLayer, layers: HudProps['layers']): boolean {
  return layers?.[layer] !== false;
}

function eventMessageFor({
  combatState,
  lastAttackId,
  lastInputRejection,
  lastResult,
}: {
  combatState: CombatState;
  lastAttackId: AttackId | null;
  lastInputRejection: InputRejectionReason | null;
  lastResult: JudgeResult | null;
}): string | null {
  if (combatState === 'BOSS_DOWN') return 'COUNTER!';
  if (lastInputRejection === 'WHIFF') return 'WHIFF';
  if (lastInputRejection === 'TOO_EARLY') return 'TOO EARLY';

  switch (lastResult) {
    case 'PERFECT_DODGE':
      return 'PERFECT DODGE';
    case 'JUST_GUARD':
      return 'JUST GUARD';
    case 'TOO_EARLY':
      return 'TOO EARLY';
    case 'HIT':
    case 'MISS':
      if (lastAttackId === 'YAWN_WAVE') return 'DROWSY!';
      if (lastAttackId === 'FLUFFY_FUTON') return 'GOOD NIGHT';
      return 'HIT';
    default:
      return null;
  }
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
  const sleepiness = useGameStore((state) => state.sleepiness);
  const lastAction = useGameStore((state) => state.lastAction);
  const lastAttackId = useGameStore((state) => state.lastAttackId);
  const lastInputRejection = useGameStore((state) => state.lastInputRejection);
  const lastResult = useGameStore((state) => state.lastResult);
  const eventSequence = useGameStore((state) => state.eventSequence);
  const combatState = useGameStore((state) => state.combatState);
  const eventMessage = eventMessageFor({
    combatState,
    lastAttackId,
    lastInputRejection,
    lastResult,
  });
  return (
    <div className={styles.hud}>
      {isLayerVisible('BOSS_HP', layers) && (
        <div className={styles.bossBar}>
          <span className={styles.label}>SLEEP DEMON</span>
          <div className={styles.gauge}>
            <div
              className={styles.gaugeFill}
              style={{ width: `${(bossHp / INITIAL_BOSS_HP) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isLayerVisible('SLEEPINESS', layers) && (
        <div className={styles.sleepiness}>
          <span className={styles.label}>HORI SLEEPINESS</span>
          <span className={styles.value}>
            <span>{sleepiness}</span>
            <span aria-hidden="true">%</span>
          </span>
        </div>
      )}

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
