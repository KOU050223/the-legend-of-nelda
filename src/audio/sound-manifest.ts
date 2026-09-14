/**
 * SE の論理名 → 音源ファイルの対応表。docs/technical-design.md §15。
 *
 * ## 差し替え方
 *
 * 収録した本素材を入れるときは、次のどちらかで済むようにしてある。
 *
 * 1. `public/audio/se/` の同名ファイルを上書きする (コード変更なし)
 * 2. 別名のファイルを置き、この表の `src` を1行書き換える
 *
 * 仮素材は `scripts/generate-placeholder-se.mjs` が生成する合成音。
 * 本素材が来たら生成スクリプトごと消してよい。手順は docs/se-assets.md。
 *
 * `gain` は素材ごとの音量差を吸収する係数。本素材へ差し替えたときに
 * ここだけで鳴りを揃えられるようにしておく。
 */

/** 再生する SE の論理名。Cue ID や判定結果からこの名前へ写す。 */
export const SOUND_IDS = [
  // 予兆 (Audio Cue)
  'pillow-sweep-wind',
  'yawn-inhale',
  'futon-jingle',
  // 着弾・結果
  'hit-impact',
  'dodge-success',
  'guard-success',
  'counter-success',
  'boss-down',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export interface SoundDefinition {
  /** 音源のURL。`public/` 以下は配信時にルート直下へ出る。 */
  src: string;
  /** 素材ごとの音量差を吸収する係数 (0〜1)。 */
  gain: number;
}

export const SOUND_MANIFEST: Readonly<Record<SoundId, SoundDefinition>> = {
  'pillow-sweep-wind': { src: '/audio/se/pillow-sweep-wind.wav', gain: 0.6 },
  'yawn-inhale': { src: '/audio/se/yawn-inhale.wav', gain: 0.5 },
  'futon-jingle': { src: '/audio/se/futon-jingle.wav', gain: 0.55 },
  'hit-impact': { src: '/audio/se/hit-impact.wav', gain: 0.7 },
  'dodge-success': { src: '/audio/se/dodge-success.wav', gain: 0.5 },
  'guard-success': { src: '/audio/se/guard-success.wav', gain: 0.6 },
  'counter-success': { src: '/audio/se/counter-success.wav', gain: 0.75 },
  'boss-down': { src: '/audio/se/boss-down.wav', gain: 0.7 },
};

/**
 * Audio Cue ID から SE を引く。
 *
 * Cue ID は技側が向きを埋め込むことがあるため
 * (`pillow-sweep-wind-left` / `-right`、pillow-sweep.ts の pillowSweepAudioCue)
 * 前方一致で畳む。左右で音を鳴らし分けたくなったら、この表へ
 * `pillow-sweep-wind-left` を足せば完全一致が優先される。
 */
export function soundIdForAudioCue(cue: string): SoundId | null {
  if (isSoundId(cue)) return cue;

  const prefixed = SOUND_IDS.find((id) => cue.startsWith(`${id}-`));
  return prefixed ?? null;
}

function isSoundId(cue: string): cue is SoundId {
  return (SOUND_IDS as readonly string[]).includes(cue);
}
