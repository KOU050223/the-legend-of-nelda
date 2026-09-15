import { DEFAULT_HORI_ATTACKS } from '@/game/config/phase2-boss-balance';

/**
 * 絶対起床アラーム (WAKE_UP_ALARM) の見た目を「ダンベルを地面へ叩きつけ、
 * 衝撃波が広がる」へ寄せるための計算。Issue #122。
 *
 * 技IDと当たり判定 (RING innerRadius 3 / outerRadius 18) は変えない。
 * 変えるのは絵だけで、危険範囲そのものは `DangerZoneMarks` が今まで通り
 * 描く。演出が範囲情報を上書きしないこと (「B級演出でも情報は潰さない」
 * docs/phase2-gameplay-spec.md / Issue #58) がこの技の前提。
 *
 * コンポーネントと別ファイルにしてあるのは `danger-zone-geometry.ts` と
 * 同じ理由で、Fast Refresh がコンポーネント以外の export を含むファイルで
 * 状態を保てないため。
 */

/** 危険範囲の内径・外径。衝撃波はこの2つの間を掃く。 */
const { shape: ALARM_SHAPE } = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

/** 衝撃波が掃く内径。危険範囲の内側 (足元の安全地帯) から始める。 */
export const SHOCKWAVE_INNER_RADIUS = ALARM_SHAPE.kind === 'RING' ? ALARM_SHAPE.innerRadius : 3;

/** 衝撃波が届く外径。危険範囲の外径と一致させる。 */
export const SHOCKWAVE_OUTER_RADIUS = ALARM_SHAPE.kind === 'RING' ? ALARM_SHAPE.outerRadius : 18;

/** ダンベルを振り上げる高さ。予兆の頭でここまで上がる。 */
export const DUMBBELL_LIFT_HEIGHT = 6.5;

/** 叩きつけた後にダンベルが残る高さ (地面に転がっている見た目)。 */
export const DUMBBELL_GROUND_HEIGHT = 0.5;

/**
 * 予兆のうち、振り上げに使う割合。残りは振り上げきった位置での「溜め」。
 *
 * 予兆の尺いっぱいを使って落とすと、落下が遅すぎて叩きつけに見えない。
 * 早めに振り上げきって静止させ、最後に一気に落とす。
 */
const LIFT_RATIO = 0.45;

/** 予兆のうち、落下に使う割合 (終端側)。 */
const DROP_RATIO = 0.25;

export type DumbbellSlamPhase = 'LIFT' | 'HOLD' | 'DROP' | 'IMPACT' | 'NONE';

export interface DumbbellSlamState {
  readonly phase: DumbbellSlamPhase;
  /** ダンベルの高さ (ワールド単位)。 */
  readonly dumbbellY: number;
  /** ダンベルの見た目の大きさ倍率。叩きつけた瞬間だけ潰して重みを出す。 */
  readonly dumbbellSquash: number;
  /** 衝撃波リングの現在の半径。判定中だけ 0 より大きくなる。 */
  readonly shockwaveRadius: number;
  /** 衝撃波の不透明度 (0〜1)。強度を掛ける前の値。 */
  readonly shockwaveOpacity: number;
}

/** 何も出さない状態。 */
const IDLE: DumbbellSlamState = {
  phase: 'NONE',
  dumbbellY: 0,
  dumbbellSquash: 1,
  shockwaveRadius: 0,
  shockwaveOpacity: 0,
};

/** 0〜1 に丸める。 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 落下の加速。終わりに向かって速くなる (自由落下に見せる)。 */
function accelerate(t: number): number {
  return t * t;
}

/** 振り上げの減速。持ち上げきる手前で緩む。 */
function decelerate(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export interface DumbbellSlamTiming {
  readonly telegraphMs: number;
  readonly activeMs: number;
}

/**
 * 技が始まってからの経過時間から、ダンベルと衝撃波の状態を求める。
 *
 * 予兆 (telegraphMs) のあいだに振り上げ → 溜め → 落下し、判定 (activeMs) の
 * あいだに衝撃波が内径から外径まで広がる。判定の尺と衝撃波が広がりきる尺を
 * 揃えているので、リングが外径へ届いた瞬間に判定も終わる。「見えている
 * 範囲と当たる範囲が同じ」を絵の側でも守るため。
 *
 * 判定の後 (RECOVER 以降) は何も出さない。硬直中にダンベルが残っていると、
 * まだ判定が続いているように見える。
 */
export function dumbbellSlamStateAt(
  elapsedMs: number,
  timing: DumbbellSlamTiming,
): DumbbellSlamState {
  const { telegraphMs, activeMs } = timing;
  if (elapsedMs < 0) return IDLE;

  if (elapsedMs < telegraphMs) {
    const liftMs = telegraphMs * LIFT_RATIO;
    const dropMs = telegraphMs * DROP_RATIO;
    const dropStartMs = telegraphMs - dropMs;

    if (elapsedMs < liftMs) {
      const t = liftMs <= 0 ? 1 : clamp01(elapsedMs / liftMs);
      return {
        ...IDLE,
        phase: 'LIFT',
        dumbbellY: DUMBBELL_GROUND_HEIGHT + decelerate(t) * DUMBBELL_LIFT_HEIGHT,
      };
    }

    if (elapsedMs < dropStartMs) {
      return { ...IDLE, phase: 'HOLD', dumbbellY: DUMBBELL_GROUND_HEIGHT + DUMBBELL_LIFT_HEIGHT };
    }

    const t = dropMs <= 0 ? 1 : clamp01((elapsedMs - dropStartMs) / dropMs);
    return {
      ...IDLE,
      phase: 'DROP',
      dumbbellY: DUMBBELL_GROUND_HEIGHT + (1 - accelerate(t)) * DUMBBELL_LIFT_HEIGHT,
    };
  }

  if (elapsedMs < telegraphMs + activeMs) {
    const t = activeMs <= 0 ? 1 : clamp01((elapsedMs - telegraphMs) / activeMs);
    return {
      phase: 'IMPACT',
      dumbbellY: DUMBBELL_GROUND_HEIGHT,
      // 着地の瞬間だけ潰し、すぐ戻す。重い物が落ちた手応えを出す。
      dumbbellSquash: 1 - Math.max(0, 1 - t * 6) * 0.45,
      shockwaveRadius:
        SHOCKWAVE_INNER_RADIUS + (SHOCKWAVE_OUTER_RADIUS - SHOCKWAVE_INNER_RADIUS) * t,
      // 広がるほど薄くする。外径へ届く頃にはほぼ消えている。
      shockwaveOpacity: 1 - t,
    };
  }

  return IDLE;
}
