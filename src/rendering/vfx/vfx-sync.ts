import type { GameEventBus } from '@/game/events/game-event';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  visualScale,
  type PresentationSettings,
} from '@/presentation/presentation-settings';

import { vfxForEvent } from './vfx-cue';
import { useVfxStore } from './vfx-store';

export interface VfxSyncOptions {
  eventBus: GameEventBus;
  /** 演出の実時間。既定は performance.now。テストから固定する。 */
  now?: () => number;
  /** 強度と ON / OFF を読む。呼び出しごとに読むので設定変更が即座に効く。 */
  getSettings?: () => PresentationSettings;
}

/**
 * Game Event を VFX の再生状態へ一方向に転写する。
 * HUD の game-event-sync と同じ形で、Presentation 側は読むだけ。
 *
 * 絵を切っていてもイベントは流れ続け、判定・HP・State 遷移は変わらない
 * (Issue #11 完了条件)。
 *
 * @returns 購読を解除する関数
 */
export function syncVfxWithGameEvents({
  eventBus,
  now = () => performance.now(),
  getSettings = () => DEFAULT_PRESENTATION_SETTINGS,
}: VfxSyncOptions): () => void {
  return eventBus.subscribe((event) => {
    const store = useVfxStore.getState();

    // 次の技が始まったら前の技の演出を捨てる。残すと軌跡や暗転が
    // 攻撃フェーズを跨いで見えたままになる (HUD の UI-008 と同じ理由)。
    if (event.type === 'ATTACK_STARTED') {
      store.clear();
      return;
    }

    if (visualScale(getSettings()) <= 0) return;

    const cueId = event.type === 'ATTACK_VISUAL_CUE' ? event.cue : null;
    const startedAt = now();

    for (const cue of vfxForEvent(event)) {
      store.push(cue, startedAt, cueId);
    }
  });
}
