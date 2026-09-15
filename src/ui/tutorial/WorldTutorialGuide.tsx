import styles from './TutorialGuide.module.css';

/** ワールド探索中に常時表示する操作案内。 */
export function WorldTutorialGuide(): React.JSX.Element {
  return (
    <output className={`${styles.guide} ${styles.worldGuide}`} aria-label="ワールドの操作方法">
      <span className={styles.eyebrow}>ナビ妖精</span>
      <strong>冒険の操作方法</strong>
      <span>WASD / 矢印キー：移動</span>
      <span>SPACE / J：攻撃</span>
      <span>SHIFT：回避</span>
      <span>E：調べる</span>
    </output>
  );
}
