import { INITIAL_BOSS_HP } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import styles from './Hud.module.css';

/**
 * HUD は React DOM で Canvas へ重ねる。3D Scene 内へは配置しない。
 * (docs/technical-design.md §5.5 / §14)
 */
export function Hud(): React.JSX.Element {
  const bossHp = useGameStore((state) => state.bossHp);
  const sleepiness = useGameStore((state) => state.sleepiness);
  const lastAction = useGameStore((state) => state.lastAction);

  return (
    <div className={styles.hud}>
      <div className={styles.bossBar}>
        <span className={styles.label}>SLEEP DEMON</span>
        <div className={styles.gauge}>
          <div
            className={styles.gaugeFill}
            style={{ width: `${(bossHp / INITIAL_BOSS_HP) * 100}%` }}
          />
        </div>
      </div>

      <div className={styles.sleepiness}>
        <span className={styles.label}>HORI SLEEPINESS</span>
        <span className={styles.value}>{sleepiness}</span>
      </div>

      <div className={styles.lastAction}>{lastAction ?? 'READY'}</div>
    </div>
  );
}
