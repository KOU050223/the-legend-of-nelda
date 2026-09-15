import { useEffect, useRef, useState } from 'react';

import { useScreenStore, type GameMode, type Screen } from '@/app/screen';

import styles from './TitleScreen.module.css';
import { createTitleVoicePlayer, type TitleVoicePlayer } from './title-voice';

interface MenuItem {
  label: string;
  screen: Screen;
  mode?: GameMode;
}

/**
 * 遷移先は「今そこへ行ける画面」だけを並べる。押しても何も起きない項目を
 * 出すと、タイトルが実装状況の嘘をつくことになるため。
 *
 * ワールドは `?scene=world` と同じく開発時限定 (scene-mode.ts)。本番ビルドでは
 * この行自体を出さない。
 */
function menuItems(): MenuItem[] {
  const items: MenuItem[] = [
    { label: 'ひとりで', screen: 'INTRO', mode: 'SINGLE' },
    { label: 'みんなで', screen: 'INTRO', mode: 'MULTIPLAYER' },
  ];
  if (import.meta.env.DEV) items.push({ label: 'ワールドへ', screen: 'WORLD' });
  return items;
}

export function TitleScreen(): React.JSX.Element {
  const goTo = useScreenStore((state) => state.goTo);
  const items = menuItems();
  const voicePlayer = useRef<TitleVoicePlayer | null>(null);
  const [heroReaction, setHeroReaction] = useState(0);

  useEffect(() => {
    const player = createTitleVoicePlayer();
    voicePlayer.current = player;
    return () => {
      voicePlayer.current = null;
      player.dispose();
    };
  }, []);

  return (
    <div className={styles.title}>
      <img className={styles.background} src="/title/bg.png" alt="" aria-hidden="true" />
      <button
        className={styles.heroButton}
        type="button"
        aria-label="堀大輔に話しかける"
        title="堀大輔に話しかける"
        onClick={() => {
          voicePlayer.current?.playRandom();
          setHeroReaction((current) => current + 1);
        }}
      >
        <img
          className={`${styles.hero} ${heroReaction === 0 ? '' : heroReaction % 2 === 0 ? styles.heroReactionA : styles.heroReactionB}`}
          src="/title/hero.png"
          alt="崖の上に立つ勇者"
          width={58}
          height={66}
        />
      </button>

      <div className={styles.menu}>
        <h1 className={styles.logo}>寝ルダの伝説</h1>
        <p className={styles.subtitle}>〜3人の勇者と眠らない男〜</p>
        <nav className={styles.links} aria-label="メニュー">
          {items.map((item, index) => (
            <button
              key={item.mode ?? item.screen}
              type="button"
              className={index === 0 ? styles.primary : styles.link}
              onClick={() => {
                if (item.mode !== undefined) useScreenStore.getState().selectMode(item.mode);
                goTo(item.screen);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
