import { useScreenStore, type Screen } from '@/app/screen';

import styles from './TitleScreen.module.css';

interface MenuItem {
  label: string;
  screen: Screen;
}

/**
 * 遷移先は「今そこへ行ける画面」だけを並べる。押しても何も起きない項目を
 * 出すと、タイトルが実装状況の嘘をつくことになるため。
 *
 * ワールドは `?scene=world` と同じく開発時限定 (scene-mode.ts)。本番ビルドでは
 * この行自体を出さない。
 */
function menuItems(): MenuItem[] {
  const items: MenuItem[] = [{ label: 'はじめから', screen: 'BATTLE' }];
  if (import.meta.env.DEV) items.push({ label: 'ワールドへ', screen: 'WORLD' });
  return items;
}

export function TitleScreen(): React.JSX.Element {
  const goTo = useScreenStore((state) => state.goTo);
  const items = menuItems();

  return (
    <div className={styles.title}>
      <div className={styles.sky} />
      <div className={styles.mountains} />
      <div className={styles.ridge} />
      <img
        className={styles.hero}
        src="/title/hero.png"
        alt="崖の上に立つ勇者"
        width={63}
        height={67}
      />

      <div className={styles.menu}>
        <h1 className={styles.logo}>寝ルダの伝説</h1>
        <p className={styles.subtitle}>〜3人の勇者と眠らない男〜</p>
        <nav className={styles.links} aria-label="メニュー">
          {items.map((item, index) => (
            <button
              key={item.screen}
              type="button"
              className={index === 0 ? styles.primary : styles.link}
              onClick={() => goTo(item.screen)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
