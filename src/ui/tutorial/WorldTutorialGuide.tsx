import { useEffect, useState } from 'react';

import { useWorldTutorialStore } from './world-tutorial-store';
import styles from './TutorialGuide.module.css';

const WORLD_TUTORIAL_DURATION_MS = 30_000;

/** ワールド探索中に常時表示する操作案内。 */
export function WorldTutorialGuide(): React.JSX.Element | null {
  const [visible, setVisible] = useState(true);
  const setWorldTutorialVisible = useWorldTutorialStore((state) => state.setVisible);

  useEffect(() => {
    setWorldTutorialVisible(true);

    const timer = window.setTimeout(() => {
      setVisible(false);
      setWorldTutorialVisible(false);
    }, WORLD_TUTORIAL_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
      setWorldTutorialVisible(false);
    };
  }, [setWorldTutorialVisible]);

  if (!visible) return null;

  return (
    <output className={`${styles.guide} ${styles.worldGuide}`} aria-label="ワールドの操作方法">
      <span className={styles.eyebrow}>ナビ妖精</span>
      <strong>冒険の操作方法</strong>
      <span>WASD / 矢印キー：移動</span>
      <span>SPACE / J：攻撃</span>
      <span>SHIFT：回避</span>
      <span>E：調べる</span>
      <span>C：カメラ切替（3人称 / 俯瞰 / 一人称）</span>
      <span>一人称中：画面クリック＋マウスで見回す</span>
    </output>
  );
}
