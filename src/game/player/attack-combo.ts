import {
  COMBO_STEPS,
  COMBO_WINDOW_MS,
  ORA_VOICE_DAMAGE_MULTIPLIER_MAX,
  ORA_VOICE_DAMAGE_MULTIPLIER_MIN,
  type ComboStep,
} from '../config/phase2-player-balance';

/**
 * 通常攻撃の3段連撃。docs/phase2-gameplay-spec.md §4.1。
 *
 * 判定のタイミングはここが決める。Animation Frame から呼び返さない
 * (docs/technical-design.md §13 / #56 完了条件「攻撃判定が Animation Frame
 * ではなくロジック側のタイミングで決まる」)。表示側は状態を読んで
 * モーションを合わせるだけにする。
 */

export type ComboPhase = 'WINDUP' | 'ACTIVE' | 'RECOVER' | 'DONE';

/** 進行中の1段。シリアライズできる値だけを持つ。 */
export interface ComboSwing {
  /** 0始まりの段番号。 */
  readonly stepIndex: number;
  /** 振り始めた時刻 (GameClock の now)。 */
  readonly startedAt: number;
  /** 音声ATTACKの声量から求めたダメージ倍率。旧スナップショットでは未指定。 */
  readonly damageMultiplier?: number;
  /** すでにダメージを与えたか。1段で二重に当てない。 */
  readonly hasHit: boolean;
}

export function comboStepAt(index: number): ComboStep {
  return (
    COMBO_STEPS[index] ??
    COMBO_STEPS[0] ?? { windupMs: 0, activeMs: 0, recoverMs: 0, damageScale: 1 }
  );
}

/** 音声ATTACKの声量をダメージ倍率へ変換する。 */
export function damageMultiplierForIntensity(intensity: number | undefined): number {
  if (intensity === undefined) return 1;
  // Protocolは有限数だけを検証するため、Authority側でも受信値の範囲を信用しない。
  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  return (
    ORA_VOICE_DAMAGE_MULTIPLIER_MIN +
    clampedIntensity * (ORA_VOICE_DAMAGE_MULTIPLIER_MAX - ORA_VOICE_DAMAGE_MULTIPLIER_MIN)
  );
}

/** 振り始めてからの経過時間が、どの局面にあたるか。 */
export function comboPhaseAt(elapsedMs: number, step: ComboStep): ComboPhase {
  if (elapsedMs < step.windupMs) return 'WINDUP';
  if (elapsedMs < step.windupMs + step.activeMs) return 'ACTIVE';
  if (elapsedMs < step.windupMs + step.activeMs + step.recoverMs) return 'RECOVER';
  return 'DONE';
}

/**
 * 次の攻撃入力を受け取ったときの段番号を決める。
 *
 * - 前の段の硬直が明けていなければ受け付けない (null)
 * - 猶予 (`COMBO_WINDOW_MS`) 内なら次の段へ繋ぐ
 * - 猶予を過ぎていれば1段目へ戻る
 * - 3段目まで振り切ったら1段目へ戻る
 *
 * @returns 振り始める段番号。受け付けない場合は null。
 */
export function nextComboStep(previous: ComboSwing | null, now: number): number | null {
  if (previous === null) return 0;

  const step = comboStepAt(previous.stepIndex);
  const elapsed = now - previous.startedAt;
  const phase = comboPhaseAt(elapsed, step);

  // 硬直中は次を受け付けない。連打で段を飛ばせないようにする。
  if (phase !== 'DONE') return null;

  const sinceDone = elapsed - (step.windupMs + step.activeMs + step.recoverMs);
  if (sinceDone > COMBO_WINDOW_MS) return 0;

  const next = previous.stepIndex + 1;
  return next >= COMBO_STEPS.length ? 0 : next;
}
