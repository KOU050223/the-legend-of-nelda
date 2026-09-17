import { ARENA_RADIUS } from '../arena/arena';
import { DEFAULT_HORI_ATTACKS } from '../config/phase2-boss-balance';
import { ATTACK_REACH, DEFAULT_REVIVAL } from '../config/phase2-player-balance';
import { dangerZonesOfActiveAttack } from '../boss/attacks/hori-attacks';
import { isInsideDangerZone, type DangerZone } from '../boss/attacks/danger-zone';
import type { PlanarPosition } from '../movement/types';
import type { PlayerSnapshot } from '../player/player-state';
import type { BattleSnapshot } from '../session/boss-battle';

/**
 * 行動を選ぶための「考慮」。すべて純関数で、0〜1 のスコアを返す。
 *
 * スコアを 0〜1 に揃えてあるので、`NPC_WEIGHTS` を掛けて足すだけで
 * 行動どうしを比較できる。キャラ名での分岐はここにも書かない。
 *
 * ## 時刻は `snapshot.boss.takenAt` を使う
 *
 * `dangerZonesOfActiveAttack` は「`takenAt` と `startedAt` は同じゲームクロック
 * 上の値なので、クライアントの時計へ依存せず、サーバーから届いた状態だけで
 * 経過時間を再現できる」設計になっている。ここで別の時計 (`performance.now()`
 * など) を混ぜると、fake clock のテストは通るのに実フレームではズレる、という
 * 一番厄介な壊れ方をする。snapshot から導ける時刻はすべて `takenAt` に揃える。
 */

export function distanceBetween(a: PlanarPosition, b: PlanarPosition): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** 0〜1 に収める。 */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * 今このプレイヤーが踏んでいる危険範囲。
 *
 * 判定も描画も使っている `dangerZonesOfActiveAttack` をそのまま呼ぶ。
 * NPC だけが別の幾何を持つと、表示されている危険範囲と NPC が避ける範囲が
 * ずれる。`WAKE_UP_ALARM` のように「足元だけが安全」な RING もあるため、
 * 「ボスから離れれば安全」という近似は使えない。
 */
export function dangerZonesFor(snapshot: BattleSnapshot): readonly DangerZone[] {
  return dangerZonesOfActiveAttack(
    snapshot.boss.activeAttack,
    // BossTarget は id / position / invulnerable だけのデータ型なので、
    // PlayerSnapshot がそのまま構造的に満たす。
    snapshot.players,
    snapshot.boss.takenAt,
  );
}

export function isInAnyDangerZone(zones: readonly DangerZone[], position: PlanarPosition): boolean {
  return zones.some((zone) => isInsideDangerZone(zone, position));
}

/**
 * 技が当たるまでの残り時間 (ms)。予兆が無ければ null。
 *
 * 予兆の尺は技ごとに 900〜1800ms と幅がある
 * (`DEFAULT_HORI_ATTACKS`)。固定の窓で回避すると、短い突進には間に合わず
 * 長いフィールドには早すぎる。技ごとの `telegraphMs` から引く。
 */
export function millisecondsUntilImpact(snapshot: BattleSnapshot): number | null {
  const attack = snapshot.boss.activeAttack;
  if (attack === null) return null;

  const spec = DEFAULT_HORI_ATTACKS[attack.attackId];
  const elapsed = snapshot.boss.takenAt - attack.startedAt;
  return spec.telegraphMs - elapsed;
}

/**
 * 追尾ビームに狙われているか。
 *
 * `BLUE_LIGHT` は着弾点が速度上限付きで追ってくる (`advanceBeam`)。
 * 「今この瞬間に危険範囲の内側か」で判断すると、追尾のたびに内外が
 * 入れ替わって回避と静止を繰り返す。狙われている側は範囲の内外に関わらず
 * 走り続けるのが正解 (§9.2「走って逃げる」)。回避で無敵を挟んでも
 * 着弾点は付いてくるので、根本的な解決にならない。
 */
export function isTrackedByBeam(snapshot: BattleSnapshot, selfId: string): boolean {
  const attack = snapshot.boss.activeAttack;
  if (attack === null) return false;
  return attack.attackId === 'BLUE_LIGHT' && attack.aim.targetId === selfId;
}

/**
 * 危険の度合い。回避・退避の判断に使う。
 *
 * 危険範囲を踏んでいて、かつ着弾が近いほど高い。踏んでいなければ 0 で、
 * 予兆中でも安全な位置にいるなら慌てない。
 */
export function dangerScore(snapshot: BattleSnapshot, self: PlayerSnapshot): number {
  if (isTrackedByBeam(snapshot, self.id)) return 1;

  const zones = dangerZonesFor(snapshot);
  if (!isInAnyDangerZone(zones, self.position)) return 0;

  const remaining = millisecondsUntilImpact(snapshot);
  // 予兆が終わって判定が出ている最中も危険。
  if (remaining === null) return 0;
  if (remaining <= 0) return 1;

  const attack = snapshot.boss.activeAttack;
  if (attack === null) return 0;
  const spec = DEFAULT_HORI_ATTACKS[attack.attackId];

  // 着弾が近いほど 1 へ寄る。
  return clamp01(1 - remaining / spec.telegraphMs);
}

/** 回避が使えるか。クールダウン中は使えない。 */
export function canDodge(snapshot: BattleSnapshot, self: PlayerSnapshot): boolean {
  return self.dodgeReadyAt <= snapshot.boss.takenAt;
}

/**
 * 攻撃の見込み。ボスへ攻撃が届くほど高い。
 *
 * ボスが無敵・ダウン中でも「近づいて殴る」判断自体は変えない。
 * ダメージが通るかは `BossBattle` 側が決める。
 */
export function attackScore(snapshot: BattleSnapshot, self: PlayerSnapshot): number {
  const distance = distanceBetween(self.position, snapshot.boss.position);
  if (distance <= ATTACK_REACH) return 1;
  // 射程の外では、近いほど高い。射程の3倍まで見る。
  return clamp01(1 - (distance - ATTACK_REACH) / (ATTACK_REACH * 2));
}

/**
 * 起こしに行く相手。
 *
 * 対象は `FALLING_ASLEEP` だけ。`ASLEEP` は自力でも仲間でも戻せない
 * (§5.5 の敗北判定に数える) ので、向かっても意味がない。
 */
export function rescueTarget(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
): PlayerSnapshot | null {
  const candidates = snapshot.players.filter(
    (player) => player.id !== self.id && player.status === 'FALLING_ASLEEP',
  );
  if (candidates.length === 0) return null;

  // 一番近い相手へ向かう。2人同時に倒れたときに往復しないよう距離で決める。
  return candidates.reduce((closest, player) =>
    distanceBetween(self.position, player.position) <
    distanceBetween(self.position, closest.position)
      ? player
      : closest,
  );
}

/**
 * 救助の見込み。
 *
 * ## 距離で大きく下げない
 *
 * 当初は「近いほど高い」を主にしていたが、それでは**仲間を見殺しにする**。
 * アリーナ半径は 24 あるので、15 ほど離れた相手はスコアがほとんど残らず、
 * `attackScore` (射程外でも緩やかにしか下がらない) に負けてボスを殴り続ける。
 * 倒れた仲間は「近いときだけ拾う用事」ではなく、**起きている限り最優先で
 * 向かう用事**で、距離は向かうかどうかではなく到着までの時間を決めるだけ。
 *
 * そこで距離は下限付きの緩い減衰に留める。アリーナの端から端 (直径 48) でも
 * `DISTANT_RESCUE_FLOOR` を下回らないので、どこにいても救助へ向かう。
 *
 * 急ぎ (`urgency`) は上乗せとして効かせる。`sleepCountdownMs` は 30 秒と長く、
 * 倒れた直後は urgency がほぼ 0 になるため、これを主にすると
 * 「倒れてしばらく放置してから向かう」挙動になる。
 */
const DISTANT_RESCUE_FLOOR = 0.55;

export function rescueScore(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
  target: PlayerSnapshot | null,
): number {
  if (target === null) return 0;

  const distance = distanceBetween(self.position, target.position);
  // 蘇生できる距離まで来ていれば最大。
  if (distance <= DEFAULT_REVIVAL.reviveRange) return 1;

  // 遠くても下限を割らない。距離は「向かうか」ではなく「何番目に急ぐか」を決める。
  const reach = ARENA_RADIUS * 2;
  const proximity =
    DISTANT_RESCUE_FLOOR + (1 - DISTANT_RESCUE_FLOOR) * clamp01(1 - distance / reach);

  // 寝てしまうまでが短いほど急ぐ。上乗せなので、残り時間が長くても 0 にはしない。
  const remaining = target.sleepAt === null ? null : target.sleepAt - snapshot.boss.takenAt;
  const urgency =
    remaining === null ? 0.5 : clamp01(1 - remaining / DEFAULT_REVIVAL.sleepCountdownMs);

  return clamp01(proximity + urgency * (1 - proximity));
}

/** 蘇生できる距離まで来ているか。 */
export function isWithinReviveRange(self: PlayerSnapshot, target: PlayerSnapshot): boolean {
  return distanceBetween(self.position, target.position) <= DEFAULT_REVIVAL.reviveRange;
}
