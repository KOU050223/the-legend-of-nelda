import { useEffect, useRef, useState } from 'react';

import { useScreenStore, type GameMode, type Screen } from '@/app/screen';

import oraShadow from '../../../assets/character/star-platimun-low-poly/Oradaisuke_black.png';
import payShadow from '../../../assets/character/paypay-daisuke-v1/pay_black.png';
import odorunoShadow from '../../../assets/character/dance-daisuke/daisuke_black.png';

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
  const bgm = useRef<HTMLAudioElement | null>(null);
  const [heroReaction, setHeroReaction] = useState(0);
  const [bgmBlocked, setBgmBlocked] = useState(false);

  useEffect(() => {
    const player = createTitleVoicePlayer();
    const bgmElement = bgm.current;
    voicePlayer.current = player;
    // 音源自体が小さいため、HTMLAudioElementで設定できる最大音量にする。
    if (bgmElement !== null) bgmElement.volume = 1;
    const playback = bgmElement?.play();
    if (playback !== undefined) {
      void playback.catch(() => setBgmBlocked(true));
    }
    return () => {
      voicePlayer.current = null;
      player.dispose();
      bgmElement?.pause();
    };
  }, []);

  return (
    <div className={styles.title}>
      <audio aria-hidden="true" autoPlay loop preload="auto" ref={bgm}>
        <source src="/audio/final_sward2.mp3" type="audio/mpeg" />
        <track kind="captions" srcLang="ja" label="BGM" />
      </audio>
      <img className={styles.background} src="/title/bg.png" alt="" aria-hidden="true" />
      <div className={styles.skyFigures} aria-hidden="true">
        <img className={`${styles.skyFigure} ${styles.oraShadow}`} src={oraShadow} alt="" />
        <img className={`${styles.skyFigure} ${styles.payShadow}`} src={payShadow} alt="" />
        <img className={`${styles.skyFigure} ${styles.odorunoShadow}`} src={odorunoShadow} alt="" />
      </div>
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
          {bgmBlocked && (
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                const playback = bgm.current?.play();
                if (playback !== undefined) {
                  void playback.then(() => setBgmBlocked(false)).catch(() => setBgmBlocked(true));
                }
              }}
            >
              BGMを再生
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
