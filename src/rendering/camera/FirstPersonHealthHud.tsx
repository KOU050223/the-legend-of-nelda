import { useFirstPersonHealthHudStore } from '@/ui/hud/first-person-health-hud-store';

import styles from './FirstPersonHealthHud.module.css';

/** 一人称中でも自分の残りHPを画面上で確認できる、Client-local HUD。 */
export function FirstPersonHealthHud(): React.JSX.Element | null {
  const visible = useFirstPersonHealthHudStore((state) => state.visible);
  const hp = useFirstPersonHealthHudStore((state) => state.hp);
  const hpMax = useFirstPersonHealthHudStore((state) => state.hpMax);
  const ratio = hpMax === 0 ? 0 : Math.max(0, Math.min(1, hp / hpMax));
  const percent = Math.round(ratio * 100);

  if (!visible) return null;

  return (
    <output className={styles.health} aria-label={`HP ${hp} / ${hpMax}`}>
      <span className={styles.label}>HP</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${percent}%` }} />
      </span>
      <strong className={styles.value}>
        {hp} / {hpMax}
      </strong>
    </output>
  );
}
