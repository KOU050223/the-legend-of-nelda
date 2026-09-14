import { usePresentationStore } from '@/presentation/presentation-store';

import styles from './EffectSettings.module.css';

/** スライダーの刻み。0〜2倍まで動かせるようにして、誇張側も試せるようにする。 */
const INTENSITY_MAX = 2;
const INTENSITY_STEP = 0.1;

/**
 * 演出の ON / OFF と強度を変える設定パネル。
 * Issue #11 完了条件「演出強度を設定から調整できる」/
 * docs/single-player-poc-spec.md §20「各要素を個別にON/OFFできる設計」。
 *
 * ここで変えるのは Presentation 層の値だけなので、どう設定しても判定・HP・
 * State 遷移は変わらない。音と絵は別々に切れる (見ざる / 聞かざるへの分解の前提)。
 */
export function EffectSettings(): React.JSX.Element {
  const audioEnabled = usePresentationStore((state) => state.audioEnabled);
  const visualEnabled = usePresentationStore((state) => state.visualEnabled);
  const audioIntensity = usePresentationStore((state) => state.audioIntensity);
  const visualIntensity = usePresentationStore((state) => state.visualIntensity);

  const setAudioEnabled = usePresentationStore((state) => state.setAudioEnabled);
  const setVisualEnabled = usePresentationStore((state) => state.setVisualEnabled);
  const setAudioIntensity = usePresentationStore((state) => state.setAudioIntensity);
  const setVisualIntensity = usePresentationStore((state) => state.setVisualIntensity);

  return (
    <section className={styles.panel} aria-label="演出設定">
      <h2 className={styles.title}>Effects</h2>

      <label className={styles.row}>
        <span>Audio Cue</span>
        <input
          type="checkbox"
          checked={audioEnabled}
          onChange={(event) => setAudioEnabled(event.target.checked)}
        />
      </label>

      <label className={styles.row}>
        <span>音量</span>
        <input
          type="range"
          min={0}
          max={INTENSITY_MAX}
          step={INTENSITY_STEP}
          value={audioIntensity}
          disabled={!audioEnabled}
          onChange={(event) => setAudioIntensity(Number(event.target.value))}
        />
        <span className={styles.value}>{audioIntensity.toFixed(1)}</span>
      </label>

      <label className={styles.row}>
        <span>Visual Cue</span>
        <input
          type="checkbox"
          checked={visualEnabled}
          onChange={(event) => setVisualEnabled(event.target.checked)}
        />
      </label>

      <label className={styles.row}>
        <span>演出強度</span>
        <input
          type="range"
          min={0}
          max={INTENSITY_MAX}
          step={INTENSITY_STEP}
          value={visualIntensity}
          disabled={!visualEnabled}
          onChange={(event) => setVisualIntensity(Number(event.target.value))}
        />
        <span className={styles.value}>{visualIntensity.toFixed(1)}</span>
      </label>
    </section>
  );
}
