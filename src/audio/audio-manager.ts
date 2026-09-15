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
        // 被弾は JUDGED では鳴らさない。下の HIT State で鳴らす。
        default:
          return null;
      }

    case 'COMBAT_STATE_CHANGED':
      // 被弾。HIT State へ入ることが「攻撃が通った」ことそのもので、
      // 眠気ダメージもここで入る (boss-attack.ts)。JUDGED を発火源にすると、
      // 早押しで弾かれた周回が無音のまま被弾する。早押しは JUDGED を
      // 発行しないが State は HIT へ進むため (§13)。
      if (event.to === 'HIT') return 'hit-impact';
      // 反撃が通った瞬間。大ダウンを持つ技はさらに専用の音を重ねる。
      if (event.to === 'DAMAGE') return 'counter-success';
      if (event.to === 'BOSS_DOWN') return 'boss-down';
      return null;

    // 大ダウン中の追撃も反撃成立と同じ手応えを鳴らす。State は BOSS_DOWN の
    // ままなので COMBAT_STATE_CHANGED は流れないが、実際にHPが削れている以上
    // 無音のままにはできない。
    case 'BOSS_DOWN_FOLLOW_UP_HIT':
      return 'counter-success';

    // ボスの技が出た瞬間。技ごとに音を持つのは絶対起床アラームだけなので、
    // Cue 文字列の表は挟まず技IDで直接引く (ボス側に Cue ID が無いため)。
    case 'BOSS_ATTACK_ACTIVE':
      return event.attackId === 'WAKE_UP_ALARM' ? 'alarm-burst' : null;

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

    // 1 で頭打ちにしない。スライダーは 2.0 まで動き、素材ごとの gain を
    // 掛けたあとに最終的なクランプが入る (audio-output.ts)。
    output.play(soundId, scale);
  });

  return () => {
    unsubscribe();
    output.dispose();
  };
}
