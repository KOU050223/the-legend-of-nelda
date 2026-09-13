import { DEFAULT_ATTACK_DAMAGE } from '../config/combat-balance';
import { defineBossAttack, type AttackDirection, type BossAttack } from './boss-attack';
import type { PlayerAction } from '../types/player-action';

/**
 * 究極奥義・ふかふか布団。docs/single-player-poc-spec.md §10 / §11。
 *
 * この技だけが「回避 → カウンター」の2段階入力を要求する。ただし段階を表す
 * State を新設はしない。第1段階は他の技と同じ回避判定 (ATTACK → JUDGE)、
 * 第2段階は回避成功で入る COUNTER_WINDOW そのものなので、既存の State Machine が
 * そのまま2段階になる (docs/technical-design.md §7 の「技固有の処理を
 * State Machine 本体へ大量に記述しない」)。
 *
 * §11 のアニメーション区分と State の対応:
 *
 * - 構え (約0.7秒) + 溜め (約1.5〜1.8秒) → TELEGRAPH (2300ms)
 * - 発動 (約0.5〜0.6秒)                  → ATTACK (hitAfterMs + acceptToMs = 600ms)
 * - カウンター受付 (回避成功後0.8秒)      → COUNTER_WINDOW
 * - 大ダウン (約2.5〜3秒)                → DAMAGE (2800ms)
 */

/** 乱数の注入点。テストでは固定値を渡して左右を決め打ちする (テスト仕様 §3.2 FixedRandom)。 */
export type RandomSource = () => number;

/** 構え + 溜め。§11 の「構え 約0.7秒」「溜め 約1.5〜1.8秒」の合計。 */
const TELEGRAPH_MS = 2300;

/**
 * 大ダウンの長さ。§11 の「約2.5〜3秒反撃可能」。
 *
 * カウンター成立の DAMAGE (§15 の約0.4秒) を抜けたあとに続く、追撃できる時間。
 * ここでの追撃はカウンター成立そのもののダメージ (30) とは別に加算される。
 */
const DOWN_MS = 2800;

/**
 * カウンター受付。仕様どおり「回避成功後 0.8秒以内」(§12)。
 *
 * 起点は回避が受理された時刻。`counterWindowFromCorrectInput` で
 * 共通基盤にそう伝えている。State Machine の COUNTER_WINDOW は既定では
 * 着弾時刻 + 入力受付の後端に開くため、指定しないと受付幅のどこで
 * 回避が通ったかによって反撃可能時間の長さが変わってしまう
 * (回避が -0.6秒で通れば 1.5秒、着弾時なら 0.9秒、といった具合)。
 *
 * 境界 (0.80秒ちょうど) は含む。State Machine の滞在時間は
 * 「超えたら自動で閉じる」封筒として使い、inclusive な期限判定は
 * 共通基盤の入力側が持つ (FUTON-004 / FUTON-005)。
 */
const COUNTER_WINDOW_MS = 800;

/**
 * 回避の受付幅。§12 の基本受付時間 -0.6秒 〜 +0.1秒。
 *
 * 成功 (perfect) 幅は受付幅と同じに採る。§10 / §12 が布団について挙げる窓は
 * 「回避できたか」の1つだけで、受理はされるが成功しない中間帯を仕様が持たない。
 * 分けると -0.60秒の境界で正しい方向へ回避しても HIT になり、
 * FUTON-001 / FUTON-002 が成立しなくなる。
 */
const ACCEPT_FROM_MS = -600;
const ACCEPT_TO_MS = 100;

/** 布団を構えた方向に対する正解の回避方向。右から来たら左へ逃げる (§10)。 */
const DODGE_AGAINST: Readonly<Record<'LEFT' | 'RIGHT', PlayerAction>> = {
  LEFT: 'DODGE_RIGHT',
  RIGHT: 'DODGE_LEFT',
};

/** 構えた向きを含む Visual Cue の ID。Rendering 側が左右を描き分けるために使う。 */
function futonVisualCue(direction: 'LEFT' | 'RIGHT'): string {
  return direction === 'LEFT' ? 'futon-summon-left' : 'futon-summon-right';
}

export interface FluffyFutonOptions {
  /** 省略時は Math.random。左右の構えを決めるためだけに使う。 */
  random?: RandomSource;
}

/**
 * 左右どちらかに構えた布団を作る。
 *
 * direction と correctAction は必ずここで対にして導出する。呼び出し側が
 * 別々に指定できると「右布団に右回避が正解」のような食い違いを作れてしまう。
 */
export function createFluffyFutonAttack({
  random = Math.random,
}: FluffyFutonOptions = {}): BossAttack {
  const direction: Extract<AttackDirection, 'LEFT' | 'RIGHT'> = random() < 0.5 ? 'LEFT' : 'RIGHT';

  return defineBossAttack({
    id: 'FLUFFY_FUTON',
    type: 'FLUFFY_FUTON',
    direction,
    // Cue は1技につき1つの文字列 ID だけを持つ。「ジングル → 寝息 → ポフッ」の
    // ような多拍の分節は、この ID を受け取った Audio / Rendering レイヤーの
    // 責務で、Game Logic 側では分けない (CUE-006 の多重発火防止)。
    //
    // Visual Cue だけは構えた向きを含める。ATTACK_VISUAL_CUE が運ぶのは
    // attackId と cue の文字列だけで direction は乗らないため、向きを
    // 畳み込まないと Rendering 側が左右どちらに布団を出すか決められない。
    // プレイヤーが回避方向を選ぶための情報そのものなので落とせない (§10)。
    visualCue: futonVisualCue(direction),
    // 聴覚の予兆は方向を持たない。§10 が挙げる音 (専用ジングル / 寝息 /
    // 「ポフッ」) はいずれも左右を区別しないため、向きを含めない。
    audioCue: 'futon-jingle',
    hitTiming: {
      // 発動 (約0.5〜0.6秒) のうち、叩きつけから着弾までが 500ms。
      hitAfterMs: 500,
      acceptFromMs: ACCEPT_FROM_MS,
      acceptToMs: ACCEPT_TO_MS,
      perfectFromMs: ACCEPT_FROM_MS,
      perfectToMs: ACCEPT_TO_MS,
    },
    correctAction: DODGE_AGAINST[direction],
    counterWindowMs: COUNTER_WINDOW_MS,
    // 「回避成功後0.8秒以内」を回避が受理された時刻から測る (§12)。
    counterWindowFromCorrectInput: true,
    damage: DEFAULT_ATTACK_DAMAGE.FLUFFY_FUTON.bossDamage,
    sleepinessDamage: DEFAULT_ATTACK_DAMAGE.FLUFFY_FUTON.sleepinessDamage,
    // 大ダウンは DAMAGE の上書きではなく専用の State で表す。
    // §15 の共通ステート時間は DAMAGE を「約0.4秒」と定めており、
    // ここを伸ばすと反撃が入ったことを示す State の意味が変わってしまう。
    bossDownMs: DOWN_MS,
    timings: {
      TELEGRAPH: TELEGRAPH_MS,
    },
  });
}
