import { DEFAULT_ATTACK_DAMAGE } from '../config/combat-balance';
import { defineBossAttack, type BossAttack } from './boss-attack';

/**
 * ボスが大きく息を吸い込み、眠気を伴う衝撃波を正面へ放つ技。
 * docs/single-player-poc-spec.md §8。
 *
 * 正面攻撃なので方向を持たず (direction: 'CENTER')、正解はガード。
 * 左右の回避は方向の読み違えではなく択そのものの誤りとして被弾する
 * (YAWN-002 / YAWN-003)。
 */

/**
 * 予兆 (TELEGRAPH) の長さ。構え・溜め・発射直前の無音までを含む。
 *
 * 吸気音の上昇と「発射直前の約0.15秒の無音」は、この尺を受け取った
 * Audio レイヤーが着弾から逆算して組み立てる。Game Logic 側は Cue ID を
 * 1つ出すだけに留め、多拍の分節は持たない (docs/technical-design.md §6)。
 */
const TELEGRAPH_MS = 2000;

/**
 * ATTACK State に入ってから衝撃波が着弾するまでの時間。
 *
 * ATTACK の滞在時間は `hitAfterMs + acceptToMs` で導出されるため
 * (boss-attack.ts の toCombatAttack)、ここを 450ms に採ると 550ms になり、
 * docs/single-player-poc-spec.md §15 の ATTACK 0.3〜0.6秒 に収まる。
 * 同 §8 の発動 (約0.4〜0.5秒) とも揃う。
 */
const HIT_AFTER_MS = 450;

/**
 * ガードの受付幅。docs/single-player-poc-spec.md §12。
 *
 * あくび衝撃波のガードは着弾 -0.7秒 〜 +0.1秒 で、回避の基本受付
 * (-0.6秒 〜 +0.1秒) より開始が 0.1秒 早い非対称な窓になっている。
 *
 * perfect 幅は受付幅と同じに採る。仕様が挙げる窓は1つだけで、
 * その開始境界 (-0.70秒) の入力も成功と定めているため
 * (docs/tests/phase1-single-player-test-spec.md YAWN-005)。
 * 受付内のガードは一律 JUST GUARD になる。
 */
const ACCEPT_FROM_MS = -700;
const ACCEPT_TO_MS = 100;

/** ガード成功後の反撃可能時間。仕様は約2秒 (同 §8 / YAWN-008)。 */
const COUNTER_WINDOW_MS = 2000;

const { bossDamage, sleepinessDamage } = DEFAULT_ATTACK_DAMAGE.YAWN_WAVE;

/** あくび衝撃波の攻撃定義。 */
export const yawnWave: BossAttack = defineBossAttack({
  id: 'YAWN_WAVE',
  type: 'YAWN_WAVE',
  direction: 'CENTER',
  visualCue: 'yawn-inhale',
  audioCue: 'yawn-inhale',
  timings: {
    TELEGRAPH: TELEGRAPH_MS,
  },
  hitTiming: {
    hitAfterMs: HIT_AFTER_MS,
    acceptFromMs: ACCEPT_FROM_MS,
    acceptToMs: ACCEPT_TO_MS,
    perfectFromMs: ACCEPT_FROM_MS,
    perfectToMs: ACCEPT_TO_MS,
  },
  correctAction: 'GUARD',
  counterWindowMs: COUNTER_WINDOW_MS,
  damage: bossDamage,
  sleepinessDamage,
});
