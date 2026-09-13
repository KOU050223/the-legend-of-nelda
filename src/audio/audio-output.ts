import { SOUND_MANIFEST, type SoundId } from './sound-manifest';

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
 * 要素を複製する。元の要素は事前読み込みのキャッシュとしてだけ持つ。
 */
export function createHtmlAudioOutput(): AudioOutput {
  const cache = new Map<SoundId, HTMLAudioElement>();

  function load(soundId: SoundId): HTMLAudioElement | null {
    const cached = cache.get(soundId);
    if (cached) return cached;

    const definition = SOUND_MANIFEST[soundId];
    if (!definition) return null;

    const element = new Audio(definition.src);
    element.preload = 'auto';
    cache.set(soundId, element);
    return element;
  }

  return {
    play(soundId, volume) {
      const source = load(soundId);
      if (!source) return;

      const definition = SOUND_MANIFEST[soundId];
      // 同じ SE が重なって鳴る場面があるので再生のたびに要素を複製する。
      // cloneNode の戻り値は Node なので、複製元と同じ型で作り直す。
      const instance = new Audio(source.src);
      instance.volume = Math.min(1, Math.max(0, volume * definition.gain));

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
      for (const element of cache.values()) {
        element.pause();
        element.src = '';
      }
      cache.clear();
    },
  };
}
