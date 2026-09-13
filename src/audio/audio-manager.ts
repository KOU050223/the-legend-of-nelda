import type { GameEvent, GameEventBus } from '@/game/events/game-event';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  audioScale,
  type PresentationSettings,
} from '@/presentation/presentation-settings';

import { createSilentAudioOutput, type AudioOutput } from './audio-output';
import { soundIdForAudioCue, type SoundId } from './sound-manifest';

/**
 * Game Event から鳴らす SE を決める。docs/technical-design.md §15 の
 *
 *   Game Event → Audio Manager → Audio Output
 *
 * のうち Manager 部分。Pure function なので、実際に音を出さずに
 * 「何が鳴るはずか」だけをテストできる。
 *
 * ATTACK_VISUAL_CUE をここで見ないのは、Visual と Audio を別レイヤーとして
 * 扱う方針のため (docs/technical-design.md §6)。音側は Audio Cue だけを聞く。
 *
 * @returns 鳴らす SE。この事象で鳴らす音が無ければ null。
 */
export function soundForEvent(event: GameEvent): SoundId | null {
  switch (event.type) {
    // 予兆。技ごとの固有SE (風切り / 吸気 / ジングル)。
    case 'ATTACK_AUDIO_CUE':
      return soundIdForAudioCue(event.cue);

    case 'JUDGED':
      switch (event.result) {
        case 'PERFECT_DODGE':
          return 'dodge-success';
        case 'JUST_GUARD':
          return 'guard-success';
        // 被弾。受付外で遅すぎた入力 (MISS) も当たっているので同じヒットSE。
        case 'HIT':
        case 'MISS':
          return 'hit-impact';
        // 早押しは弾かれただけで当たっていない。ヒットSEを鳴らすと
        // 被弾と区別がつかなくなる (docs/single-player-poc-spec.md §13)。
        default:
          return null;
      }

    case 'COMBAT_STATE_CHANGED':
      // 反撃が通った瞬間。大ダウンを持つ技はさらに専用の音を重ねる。
      if (event.to === 'DAMAGE') return 'counter-success';
      if (event.to === 'BOSS_DOWN') return 'boss-down';
      return null;

    default:
      return null;
  }
}

export interface AudioManagerOptions {
  eventBus: GameEventBus;
  /** 実際の再生先。既定は無音 (テスト・音を切った状態)。 */
  output?: AudioOutput;
  /** 音量と ON / OFF を読む。呼び出しごとに読むので設定変更が即座に効く。 */
  getSettings?: () => PresentationSettings;
}

/**
 * Game Event を購読して SE を鳴らす。
 *
 * 購読はこの1本だけにする。React コンポーネントの中で `new Audio()` を
 * 呼ばないのは、StrictMode の二重マウントで SE が重なるのと、
 * Phase 2 で Role ごとに配信先を差し替える口が散るため。
 *
 * @returns 購読と音源を解放する関数
 */
export function createAudioManager({
  eventBus,
  output = createSilentAudioOutput(),
  getSettings = () => DEFAULT_PRESENTATION_SETTINGS,
}: AudioManagerOptions): () => void {
  const unsubscribe = eventBus.subscribe((event) => {
    // 音量 0 のときは SE を引く前に抜ける。音を切っていても
    // イベントは流れ続け、ゲームロジックは影響を受けない。
    const scale = audioScale(getSettings());
    if (scale <= 0) return;

    const soundId = soundForEvent(event);
    if (soundId === null) return;

    output.play(soundId, Math.min(1, scale));
  });

  return () => {
    unsubscribe();
    output.dispose();
  };
}
