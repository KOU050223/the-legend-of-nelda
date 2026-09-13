import { SOUND_IDS, SOUND_MANIFEST, type SoundId } from './sound-manifest';

/**
 * SE を実際に鳴らす口。docs/technical-design.md §15
 * 「Audio 再生箇所を分散させない」。
 *
 * Game Logic からも React コンポーネントからも直接呼ばない。Audio Manager
 * だけがこれを持ち、テストではスパイへ差し替える (jsdom に実オーディオが
 * 無いため)。Phase 2 で Role 別配信へ移るときは、この実装だけを
 * Web Audio API 版へ置き換える。
 */
export interface AudioOutput {
  /**
   * SE を1回鳴らす。
   *
   * @param volume 0〜1 に正規化済みの音量。0 のときは呼び出し側が呼ばない。
   */
  play(soundId: SoundId, volume: number): void;
  /** 読み込み済みの音源を解放する。 */
  dispose(): void;
}

/** 何も鳴らさない出力。音を切った状態やテストの既定として使う。 */
export function createSilentAudioOutput(): AudioOutput {
  return {
    play() {},
    dispose() {},
  };
}

/**
 * HTMLAudioElement による最小実装。Phase 1 は「通常のブラウザ Audio で構わない」
 * (docs/technical-design.md §15)。
 *
 * 同じ SE が重なって鳴る場面 (大ダウン中の追撃) があるので、再生のたびに
 * 新しい要素を作る。1つの要素を使い回すと、鳴っている途中の再生要求が
 * 頭出しに戻してしまい音が切れる。ブラウザが同じURLをキャッシュするので
 * 2回目以降の読み込みは走らない。
 */
export function createHtmlAudioOutput(): AudioOutput {
  /**
   * 事前読み込み用の要素。ここでは鳴らさず、読み込みを先に済ませるためだけに持つ。
   *
   * 生成時にまとめて作る。再生要求が来てから作ったのでは、その再生自体は
   * 待たされるので事前読み込みにならない。SE は予兆の頭で鳴るため、
   * その瞬間に数十KBを取りに行くと出音が遅れる。
   */
  const preloaded = new Map<SoundId, HTMLAudioElement>();

  for (const soundId of SOUND_IDS) {
    const element = new Audio(SOUND_MANIFEST[soundId].src);
    element.preload = 'auto';
    preloaded.set(soundId, element);
  }

  /**
   * いま鳴っているインスタンス。
   *
   * dispose() で止めるために持つ。戦闘を破棄したあとに SE が鳴り続けると、
   * StrictMode の再マウントや画面遷移で前の戦闘の音が残る。
   */
  const playing = new Set<HTMLAudioElement>();

  return {
    play(soundId, volume) {
      const definition = SOUND_MANIFEST[soundId];
      if (!definition) return;

      // 読み込みは preloaded 側で済んでいるので、ここは同じURLを指すだけ。
      // ブラウザのキャッシュに載っているため再取得は走らない。
      const instance = new Audio(definition.src);
      instance.volume = Math.min(1, Math.max(0, volume * definition.gain));

      playing.add(instance);
      instance.addEventListener('ended', () => playing.delete(instance), { once: true });

      // 再生できない場面は普通に起きる (操作前の自動再生をブラウザが拒否する、
      // テスト環境に音源が無い)。演出が鳴らないだけでゲームは続くので、
      // ここで握り潰して戦闘ループへ例外を返さない。
      // play() が Promise を返さない実装もあるため、戻り値の有無も見る。
      try {
        const played: unknown = instance.play();
        if (played instanceof Promise) played.catch(() => {});
      } catch {
        // 再生できないだけ。何もしない。
      }
    },

    dispose() {
      for (const instance of playing) {
        instance.pause();
        instance.src = '';
      }
      playing.clear();

      for (const element of preloaded.values()) {
        element.pause();
        element.src = '';
      }
      preloaded.clear();
    },
  };
}
