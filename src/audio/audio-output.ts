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

  /**
   * 解除待ちの再生要求。最新の1つだけを持つ。
   *
   * `requestedAt` は拒否された瞬間の時刻。解除がその直後に来る (ボタン連打の
   * ようなケース) 前提の取り返しなので、間が空いた要求まで鳴らし直すと
   * タイミングが狂う (あくびの発射直前0.15秒無音が、無関係な遅い時刻に
   * ずれて鳴り直る、布団のポフッが着弾とかけ離れた位置で鳴るなど)。
   */
  let pending: { soundId: SoundId; volume: number; requestedAt: number } | null = null;

  /**
   * 取り返しの対象にする猶予 (ms)。
   *
   * 自動再生の拒否は Promise 解決までにブラウザの遅延が挟まるが、それ自体は
   * 数十ms程度。あくびの「発射直前の約0.15秒だけ無音」(§8) のように、
   * 素材の後半をタイミングの手がかりに使う Cue があるため、猶予は
   * その0.15秒よりはっきり短く抑える。ここより長いと、無音の境界が
   * 過ぎたあとの操作でも鳴らし直してしまい、Cue が本来の再生タイミングから
   * 外れて聞こえる方が実害が大きいので、鳴らし直さず諦める側に倒す。
   */
  const REPLAY_GRACE_MS = 50;

  function unlock(): void {
    if (unlocked) return;
    unlocked = true;

    const queued = pending;
    pending = null;
    if (!queued) return;

    // 猶予を過ぎた要求は、鳴らし直すと Cue のタイミングを誤って伝える
    // (システムリマインダー通りの理由: 例えばあくびの吸気は「発射直前の
    // 0.15秒だけ無音」が仕様なので、経過後に頭から鳴らすとその無音が
    // 着弾と無関係な位置へ移動し、誤った手がかりになる)。諦めて捨てる。
    if (Date.now() - queued.requestedAt > REPLAY_GRACE_MS) return;

    start(queued.soundId, queued.volume);
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
    instance.addEventListener(
      'ended',
      () => {
        const wasPlaying = playing.delete(instance);
        // 続きの音 (絶対起床アラームの爆発音 → 「やめてもらっていいですか」)
        // を繋ぐ。尺は素材が持つので、コード側に長さの定数を置かない。
        //
        // `playing` に居たものだけ繋ぐ。dispose() は playing を空にしてから
        // 止めるので、破棄後に鳴り始めた続きが残らない。`pause()` は ended を
        // 出さない実装が多いが、それに頼らず delete の結果で判断する。
        if (wasPlaying && definition.followedBy) start(definition.followedBy, volume);
      },
      { once: true },
    );

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
          if (!unlocked) pending = { soundId, volume, requestedAt: Date.now() };
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

      // 先に空にしてから止める。止めてから空にすると、pause() が ended を
      // 出す実装で続きの音 (followedBy) が鳴り始めてしまう。
      const stopping = [...playing];
      playing.clear();

      for (const instance of stopping) {
        instance.pause();
        instance.src = '';
      }

      for (const element of preloaded.values()) {
        element.pause();
        element.src = '';
      }
      preloaded.clear();
    },
  };
}
