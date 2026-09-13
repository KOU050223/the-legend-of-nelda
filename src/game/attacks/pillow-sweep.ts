import { DEFAULT_ATTACK_DAMAGE } from '../config/combat-balance';
import {
  defineBossAttack,
  type AttackDirection,
  type BossAttack,
  type AttackCueSettings,
} from './boss-attack';

/**
 * 枕薙ぎ払い。docs/single-player-poc-spec.md §6.1 / §7。
 *
 * 巨大な枕を左右どちらかから横薙ぎする基本技。攻撃してくる側と反対へ回避するのが正解。
 *
 * ## アニメーション4分節と State の対応
 *
 * 仕様 §7 は 構え / 溜め / 発動 / 硬直 の4つに分かれるが、新しい State は足さない
 * (docs/technical-design.md §7「技固有の処理を State Machine 本体へ大量に記述しない」)。
 *
 * | 仕様 §7 | 長さ       | State                  |
 * | ------- | ---------- | ---------------------- |
 * | 構え    | 約0.5秒    | TELEGRAPH              |
 * | 溜め    | 約0.7〜1.0秒 | TELEGRAPH             |
 * | 発動    | 約0.3〜0.4秒 | ATTACK                |
 * | 硬直    | 約1.5秒    | COUNTER_WINDOW (回避成功時) |
 *
 * 構えと溜めはどちらも「予兆を見せて入力を待つ」区間で、ゲームルール上の
 * 振る舞いが変わらないため TELEGRAPH 1つに畳む。構え→溜めの見た目・音の
 * 移り変わり (枕を引く / 風切りSEの音程上昇) は Cue ID を受け取った
 * Presentation 側の責務で、Game Logic は Cue を1回ずつしか発行しない
 * (CUE-006)。
 */

/** TELEGRAPH の長さ (ms)。構え 約0.5秒 + 溜め 約0.8秒 (仕様は0.7〜1.0秒)。 */
const TELEGRAPH_MS = 1300;

/**
 * ATTACK 開始から着弾までの時間 (ms)。
 * 着弾後の受付終了 (+100ms) と合わせて ATTACK の滞在時間 400ms になり、
 * 仕様 §7「発動 約0.3〜0.4秒」に収まる。
 */
const HIT_AFTER_MS = 300;

/** 硬直 = 反撃可能時間。仕様 §6.1「約1.5秒の反撃チャンス」/ PILLOW-007。 */
const COUNTER_WINDOW_MS = 1500;

/**
 * 回避の受付幅。着弾 -0.6秒 〜 +0.1秒
 * (docs/single-player-poc-spec.md §12 / docs/tests/phase1-single-player-test-spec.md §5)。
 *
 * 成功幅 (perfect) は受付幅と同じにする。INPUT-006 / INPUT-007 が受付の
 * 両境界を「成功判定可能」としており、JudgeResult に受付内だが成功でない
 * 回避を表す値が無いため (PERFECT_DODGE か HIT のどちらか)。
 */
const ACCEPT_FROM_MS = -600;
const ACCEPT_TO_MS = 100;

/** 枕は左右どちらかから来る。中央へ放つ技ではないので CENTER は取らない。 */
export type PillowSweepDirection = Extract<AttackDirection, 'LEFT' | 'RIGHT'>;

/**
 * 攻撃してくる側と反対へ回避するのが正解。
 * docs/single-player-poc-spec.md §6.1「右から攻撃 → 左回避 / 左から攻撃 → 右回避」。
 */
export function correctDodgeFor(direction: PillowSweepDirection) {
  return direction === 'RIGHT' ? ('DODGE_LEFT' as const) : ('DODGE_RIGHT' as const);
}

/**
 * 攻撃方向を Cue ID へ埋め込む。
 *
 * Cue イベントは `{ attackId, cue }` しか運ばず、GameEvent 型は増やさないため、
 * 「どちらの腕を引いたか」を Presentation へ伝える経路は Cue ID の文字列だけになる。
 * 1技につき Visual / Audio 各1個という Cue 契約はそのまま保つ。
 */
export function pillowSweepVisualCue(direction: PillowSweepDirection): string {
  return `pillow-sweep-telegraph-${direction.toLowerCase()}`;
}

export function pillowSweepAudioCue(direction: PillowSweepDirection): string {
  return `pillow-sweep-wind-${direction.toLowerCase()}`;
}

/**
 * 左右を1つ選ぶ。乱数を引数に取り、テストから発動方向を固定できるようにする
 * (完了条件「左右ランダムに発動する」)。
 */
export function pickPillowSweepDirection(random: () => number = Math.random): PillowSweepDirection {
  return random() < 0.5 ? 'LEFT' : 'RIGHT';
}

export interface CreatePillowSweepOptions {
  /** 発動方向。省略時は乱数で左右どちらかを選ぶ。 */
  direction?: PillowSweepDirection;
  /** 情報提示の個別 ON / OFF。省略時は両方有効 (CUE-001 / CUE-002)。 */
  cues?: AttackCueSettings;
  /** 方向を選ぶ乱数。direction を渡した場合は使わない。 */
  random?: () => number;
}

/**
 * 枕薙ぎ払いの攻撃定義を作る。副作用は持たず、乱数も引数で差し替えられる。
 * ダメージ量は設定から参照する (Issue #5「技ごとのダメージ量を設定から変更できる」)。
 */
export function createPillowSweep({
  direction,
  cues,
  random,
}: CreatePillowSweepOptions = {}): BossAttack {
  const sweepDirection = direction ?? pickPillowSweepDirection(random);
  const damage = DEFAULT_ATTACK_DAMAGE.PILLOW_SWEEP;

  const attack: BossAttack = {
    id: 'PILLOW_SWEEP',
    type: 'PILLOW_SWEEP',
    direction: sweepDirection,
    visualCue: pillowSweepVisualCue(sweepDirection),
    audioCue: pillowSweepAudioCue(sweepDirection),
    hitTiming: {
      hitAfterMs: HIT_AFTER_MS,
      acceptFromMs: ACCEPT_FROM_MS,
      acceptToMs: ACCEPT_TO_MS,
      perfectFromMs: ACCEPT_FROM_MS,
      perfectToMs: ACCEPT_TO_MS,
    },
    correctAction: correctDodgeFor(sweepDirection),
    counterWindowMs: COUNTER_WINDOW_MS,
    damage: damage.bossDamage,
    sleepinessDamage: damage.sleepinessDamage,
    // ATTACK / COUNTER_WINDOW は defineBossAttack が着弾情報から導くので、
    // ここで指定するのは TELEGRAPH だけにする。
    timings: { TELEGRAPH: TELEGRAPH_MS },
  };

  return defineBossAttack(cues ? { ...attack, cues } : attack);
}
