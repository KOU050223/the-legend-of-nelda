import { create } from 'zustand';

import {
  DEFAULT_PRESENTATION_SETTINGS,
  type EffectIntensity,
  type PresentationSettings,
} from './presentation-settings';

/**
 * 演出設定の共有状態。Presentation 層だけが読む。
 *
 * Game Logic はここを参照しないので、どの値をどう変えても判定・HP・State
 * 遷移は変わらない (Issue #11 完了条件「Cue を無効化してもゲームロジックが
 * 壊れない」/「演出強度を設定から調整できる」)。
 */
interface PresentationStore extends PresentationSettings {
  setAudioEnabled: (enabled: boolean) => void;
  setVisualEnabled: (enabled: boolean) => void;
  setAudioIntensity: (intensity: EffectIntensity) => void;
  setVisualIntensity: (intensity: EffectIntensity) => void;
}

export const usePresentationStore = create<PresentationStore>((set) => ({
  ...DEFAULT_PRESENTATION_SETTINGS,

  setAudioEnabled: (audioEnabled) => set({ audioEnabled }),
  setVisualEnabled: (visualEnabled) => set({ visualEnabled }),
  setAudioIntensity: (audioIntensity) => set({ audioIntensity }),
  setVisualIntensity: (visualIntensity) => set({ visualIntensity }),
}));

/**
 * 購読せずに今の設定を読む。Audio Manager / VFX Sync のように
 * React の外で動く購読者が、イベントを受けた時点の値を見るために使う。
 */
export function readPresentationSettings(): PresentationSettings {
  const { audioEnabled, visualEnabled, audioIntensity, visualIntensity } =
    usePresentationStore.getState();

  return { audioEnabled, visualEnabled, audioIntensity, visualIntensity };
}
