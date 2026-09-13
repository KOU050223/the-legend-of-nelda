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

/** 音の許可を取りにいくきっかけになる操作。 */
const UNLOCK_EVENTS = ['keydown', 'pointerdown'] as const;

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

  /**
   * ブラウザが音を許可済みか。
   *
   * 戦闘は操作を待たずに自動で進むため、最初の予兆 SE は「ユーザー操作前の
   * 自動再生」として拒否されうる。拒否は握り潰す (演出のために戦闘を止めない)
   * ので、そのままでは最初の技だけ静かに無音になる。最初の操作で解除し、
   * 鳴らせなかった Cue を取り返す。
   */
  let unlocked = false;

  /** 解除待ちの再生要求。最新の1つだけを持つ。 */
  let pending: { soundId: SoundId; volume: number } | null = null;

  function unlock(): void {
    if (unlocked) return;
    unlocked = true;

    const queued = pending;
    pending = null;
    if (queued) start(queued.soundId, queued.volume);
  }

  // 最初の操作で解除する。キーボードが主操作だが、どの経路でも拾えるよう
  // ポインタ操作も見る。once なので解除後はリスナーが残らない。
  for (const type of UNLOCK_EVENTS) {
    window.addEventListener(type, unlock, { once: true, passive: true });
  }

  function start(soundId: SoundId, volume: number): void {
    const definition = SOUND_MANIFEST[soundId];
    if (!definition) return;

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

      if (played instanceof Promise) {
        played.catch(() => {
          playing.delete(instance);
          // 操作前で拒否された可能性がある。最新の要求だけ残し、最初の操作で
          // 鳴らし直す。古い Cue をあとからまとめて鳴らさないよう1つに絞る。
          if (!unlocked) pending = { soundId, volume };
        });
      }
    } catch {
      playing.delete(instance);
    }
  }

  return {
    play(soundId, volume) {
      start(soundId, volume);
    },

    dispose() {
      for (const type of UNLOCK_EVENTS) {
        window.removeEventListener(type, unlock);
      }
      pending = null;

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
