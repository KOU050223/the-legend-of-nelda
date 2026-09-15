import type { AttackId } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import styles from './TutorialGuide.module.css';

interface TutorialMessage {
  title: string;
  description: string;
}

const MESSAGES: Partial<Record<AttackId, TutorialMessage>> = {
  PILLOW_SWEEP: {
    title: '枕が飛んできた！',
    description: '左右キーで攻撃をかわしてね',
  },
  YAWN_WAVE: {
    title: 'あくびの衝撃波！',
    description: '↓ / S でガードしてね',
  },
  FLUFFY_FUTON: {
    title: 'ふかふか布団に注意！',
    description: '回避したら SPACE / J で攻撃！',
  },
};

/** チュートリアル中だけナビ妖精の吹き出しを表示する。 */
export function TutorialGuide(): React.JSX.Element | null {
  const assistVisible = useGameStore((state) => state.assistVisible);
  const lastAttackId = useGameStore((state) => state.lastAttackId);
  const message = lastAttackId === null ? undefined : MESSAGES[lastAttackId];

  if (!assistVisible || message === undefined) return null;

  return (
    <output className={styles.guide} aria-label="ナビ妖精の操作説明">
      <span className={styles.eyebrow}>ナビ妖精</span>
      <strong>{message.title}</strong>
      <span>{message.description}</span>
    </output>
  );
}
