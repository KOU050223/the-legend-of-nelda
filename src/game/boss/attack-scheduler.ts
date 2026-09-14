import {
  DEFAULT_HORI_ATTACKS,
  HORI_ATTACK_INTERVAL_MS,
  type HoriAttackId,
  type OverdriveModifiers,
} from '../config/phase2-boss-balance';

/**
 * 技1回の進行段階。docs/phase2-gameplay-spec.md §9 の「予兆 → 判定 → 硬直」。
 */
export type AttackPhase = 'TELEGRAPH' | 'ACTIVE' | 'RECOVER' | 'DONE';

/** 倍率を適用した後の実際の尺。オーバードライブはここに効く。 */
export interface ScaledTiming {
  readonly telegraphMs: number;
  readonly activeMs: number;
  readonly recoverMs: number;
  readonly damage: number;
}

/**
 * 技の尺へオーバードライブの倍率を掛ける。
 *
 * 新技を足さず、既存の技の数値だけを変える (§10)。倍率は
 * `OVERDRIVE_MODIFIERS` の1箇所にあり、技ごとの表を二重に持たない。
 *
 * 判定が出ている尺 (`activeMs`) は縮めない。ここまで縮めると
 * 「当たり判定はあったが見えなかった」になり、B級演出が情報を潰す側へ回る。
 */
export function scaleTiming(attackId: HoriAttackId, modifiers: OverdriveModifiers): ScaledTiming {
  const spec = DEFAULT_HORI_ATTACKS[attackId];
  return {
    telegraphMs: spec.telegraphMs * modifiers.telegraphScale,
    activeMs: spec.activeMs,
    recoverMs: spec.recoverMs * modifiers.recoverScale,
    damage: spec.damage * modifiers.damageScale,
  };
}

/** 技が始まってからの経過時間が、どの段階にあたるか。 */
export function phaseAt(elapsedMs: number, timing: ScaledTiming): AttackPhase {
  if (elapsedMs < timing.telegraphMs) return 'TELEGRAPH';
  if (elapsedMs < timing.telegraphMs + timing.activeMs) return 'ACTIVE';
  if (elapsedMs < timing.telegraphMs + timing.activeMs + timing.recoverMs) return 'RECOVER';
  return 'DONE';
}

/** 次の技までの待ち時間。オーバードライブで縮む。 */
export function attackIntervalMs(modifiers: OverdriveModifiers): number {
  return HORI_ATTACK_INTERVAL_MS * modifiers.recoverScale;
}
