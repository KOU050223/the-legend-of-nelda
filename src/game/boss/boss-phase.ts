/**
 * 堀大輔のフェーズ進行。docs/phase2-gameplay-spec.md §12。
 *
 * ```text
 * HP 100% → 70%   導入フェーズ (INTRO)
 * HP 70%          ショートスリーパー結界①  (BARRIER_1)
 * HP 70% → 40%    睡眠時間圧縮フィールド追加 (FIELD_ADDED)
 * HP 40%          ショートスリーパー結界②  (BARRIER_2)
 * HP 40% → 10%    カフェイン・オーバードライブ (OVERDRIVE)
 * HP 10%          NO SLEEP MODE
 * ```
 *
 * 結界そのもの・NO SLEEP MODE の中身は別Issue。ここは「境界を跨いだことを
 * 外へ通知できる」ところまでを担う (Issue #58 スコープ)。
 *
 * React / Three.js へ依存しない Pure TypeScript (docs/technical-design.md §5.1)。
 */

export const BOSS_PHASES = [
  'INTRO',
  'BARRIER_1',
  'FIELD_ADDED',
  'BARRIER_2',
  'OVERDRIVE',
  'NO_SLEEP_MODE',
] as const;

export type BossPhase = (typeof BOSS_PHASES)[number];

/**
 * フェーズの開始しきい値をHP割合 (0〜1) で持つ。降順に並べる。
 *
 * 結界フェーズ (BARRIER_1 / BARRIER_2) は「HPが70%/40%へ到達した瞬間」に
 * 入り、幅を持たない。結界中はボスが無敵化する (§11) ので、解除されるまで
 * HPが動かず、次のしきい値へ自動では進まない。だから区間ではなく点でよい。
 */
const PHASE_THRESHOLDS: readonly { phase: BossPhase; enterAtRatio: number }[] = [
  { phase: 'NO_SLEEP_MODE', enterAtRatio: 0.1 },
  { phase: 'OVERDRIVE', enterAtRatio: 0.4 },
  { phase: 'BARRIER_2', enterAtRatio: 0.4 },
  { phase: 'FIELD_ADDED', enterAtRatio: 0.7 },
  { phase: 'BARRIER_1', enterAtRatio: 0.7 },
  { phase: 'INTRO', enterAtRatio: 1 },
];

/**
 * NO SLEEP MODE へ入るHP割合。
 *
 * 通常攻撃ではHPを削れなくなる最終局面の入口 (§12) なので、通常攻撃の
 * ダメージはここで止める。越えさせると最終局面ごと飛ばして勝ててしまう。
 */
export const NO_SLEEP_MODE_HP_RATIO = 0.1;

/** そのフェーズが順番として何番目か。進行が逆戻りしないことの判定に使う。 */
function phaseOrder(phase: BossPhase): number {
  return BOSS_PHASES.indexOf(phase);
}

/** フェーズの進行順。外から2つのフェーズの前後を比べるために公開する。 */
export function phaseOrderOf(phase: BossPhase): number {
  return phaseOrder(phase);
}

/**
 * 現在のフェーズから見て、HP割合が次のフェーズの開始条件を満たしているか。
 *
 * 同じしきい値 (70%) を BARRIER_1 と FIELD_ADDED が共有しているため、
 * 「割合だけ」ではどちらに居るべきか決まらない。結界はボス側の解除操作で
 * 抜けるフェーズなので、割合から求まるのは「そこまでは進める」という上限で、
 * 実際の進行は1段ずつ行う。
 */
function canEnter(phase: BossPhase, hpRatio: number): boolean {
  const threshold = PHASE_THRESHOLDS.find((entry) => entry.phase === phase);
  if (threshold === undefined) return false;
  return hpRatio <= threshold.enterAtRatio;
}

/**
 * HP割合から、今いるべきフェーズへ向けて1段だけ進める。
 *
 * **1回のダメージで複数の境界を跨ぐ場合でも、フェーズは1段ずつ進む。**
 * 75% から 35% へ一撃で落ちても BARRIER_1 を飛ばして BARRIER_2 へは行かない。
 * 結界は「解除しないと先へ進めない関門」(§11) なので、飛ばせてしまうと
 * 大ダメージを出せた側が協力ギミックを丸ごとスキップできてしまう。
 *
 * 進めない場合は現在のフェーズをそのまま返す。
 *
 * @returns 1段進めた後のフェーズ。
 */
export function advancePhase(current: BossPhase, hpRatio: number): BossPhase {
  const nextIndex = phaseOrder(current) + 1;
  const next = BOSS_PHASES[nextIndex];
  if (next === undefined) return current;

  return canEnter(next, hpRatio) ? next : current;
}

/**
 * ボスがダメージを受け付けない (無敵) フェーズか。
 *
 * 結界中は BOSS INVINCIBLE (§11)、NO SLEEP MODE は通常攻撃で削れない
 * (§12「通常攻撃ではHPを削れなくなる / 0 DAMAGE」)。
 */
export function isInvulnerablePhase(phase: BossPhase): boolean {
  return phase === 'BARRIER_1' || phase === 'BARRIER_2' || phase === 'NO_SLEEP_MODE';
}

/** そのフェーズが協力ギミック (ショートスリーパー結界) を要求するか。 */
export function isBarrierPhase(
  phase: BossPhase,
): phase is Extract<BossPhase, 'BARRIER_1' | 'BARRIER_2'> {
  return phase === 'BARRIER_1' || phase === 'BARRIER_2';
}

/**
 * カフェイン・オーバードライブが掛かっているフェーズか。§10 / §12 Phase 3。
 *
 * OVERDRIVE 以降は解除されない。一度飲んだものは戻らない。
 */
export function isOverdrivePhase(phase: BossPhase): boolean {
  return phaseOrder(phase) >= phaseOrder('OVERDRIVE');
}
