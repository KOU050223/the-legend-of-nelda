import { ARENA_RADIUS } from '../arena/arena';
import { comboPhaseAt, comboStepAt } from '../player/attack-combo';
import { ATTACK_REACH, COMBO_STEPS } from '../config/phase2-player-balance';
import type { MovementInput, PlanarPosition } from '../movement/types';
import type { PlayerSnapshot } from '../player/player-state';
import type { BattleSnapshot } from '../session/boss-battle';
import {
  attackScore,
  canDodge,
  clamp01,
  dangerScore,
  dangerZonesFor,
  distanceBetween,
  isInAnyDangerZone,
  isTrackedByBeam,
  isWithinReviveRange,
  rescueScore,
  rescueTarget,
} from './considerations';
import { IDLE_DECISION, NO_MOVEMENT, type NpcContext, type NpcDecision } from './npc-policy';
import { NPC_WEIGHTS, type NpcWeights } from './npc-weights';

/**
 * ユーティリティベースの既定ポリシー。Issue #158。
 *
 * 毎フレーム、離散行動の候補を並べてスコアを付け、最大のものを1つ採る。
 * 移動は別系統で、同じ考慮から目標地点を決めて方向ベクトルにする。
 *
 * 状態機械 (`攻撃中 / 回避中 / 蘇生中`) にしない理由は
 * docs/20260916_npc-design.md を参照。要点は、遷移条件へキャラ名の分岐が
 * 入り込み、#56 の「キャラ差はデータ、コード分岐にしない」を破ること。
 */

/**
 * この値に届く候補が無ければ何も出さない。
 *
 * 0 にすると、射程外でもスコアが僅かに正の `ATTACK` が毎フレーム勝ち、
 * 空振りし続ける。
 */
const ACTION_THRESHOLD = 0.35;

/** 最終段 (3段目) の番号。 */
const FINAL_COMBO_STEP_INDEX = COMBO_STEPS.length - 1;

/**
 * 最終段へ入るのをやめる、重み付き危険度のしきい値。
 *
 * `COMBO_STEPS` の3段目は `recoverMs: 550` と硬直が飛び抜けて長く、
 * 振り切ると予兆へ反応できない。「3段入れるか、2段で止めて回避するか」
 * (phase2-player-balance.ts) の判断をここで表す。
 *
 * 判定は `danger * selfPreservation` なので、慎重なキャラほど低い危険度で
 * 止める。PAY (1.2) は danger > 0.33、ORA (0.9) は > 0.44、
 * ODORUNO (0.6) は > 0.67 で最終段を諦める。
 */
const FINAL_COMBO_STEP_VETO = 0.4;

export function decide(snapshot: BattleSnapshot, context: NpcContext): NpcDecision {
  const self = snapshot.players.find((player) => player.id === context.selfId);
  if (self === undefined) return IDLE_DECISION;

  // 倒れている・寝ている間は自分では動けない。起こされるのを待つ。
  if (self.status !== 'ACTIVE') return IDLE_DECISION;

  const weights = NPC_WEIGHTS[self.characterId];

  const danger = dangerScore(snapshot, self);
  const target = rescueTarget(snapshot, self);
  const rescue = rescueScore(snapshot, self, target) * weights.rescue;
  const attack = attackScore(snapshot, self) * weights.aggression;
  const avoid = danger * weights.selfPreservation;

  return {
    movement: decideMovement(snapshot, self, weights, { danger, target }),
    action: decideAction(snapshot, self, weights, { attack, avoid, rescue, danger, target }),
  };
}

interface ActionScores {
  readonly attack: number;
  readonly avoid: number;
  readonly rescue: number;
  readonly danger: number;
  readonly target: PlayerSnapshot | null;
}

function decideAction(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
  weights: NpcWeights,
  scores: ActionScores,
): NpcDecision['action'] {
  const { attack, avoid, rescue, target } = scores;

  // 蘇生は距離まで詰めてからでないと出せない。届いていなければ移動に任せる。
  const canRevive = target !== null && isWithinReviveRange(self, target);

  // 回避は無敵で技をやり過ごす行動なので、クールダウン中は候補にならない。
  // その場合は移動側が危険範囲から出る (decideMovement)。
  // 追尾ビームは回避しても着弾点が付いてくるため、走って逃げるほうを採る。
  const canAvoidByDodge =
    canDodge(snapshot, self) && !isTrackedByBeam(snapshot, self.id) && avoid > 0;

  const candidates: { readonly score: number; readonly action: NpcDecision['action'] }[] = [
    { score: canAvoidByDodge ? avoid : 0, action: { type: 'DODGE' } },
    { score: canRevive ? rescue : 0, action: { type: 'REVIVE' } },
    {
      score: canStartAttack(snapshot, self, weights, scores) ? attack : 0,
      action: { type: 'ATTACK' },
    },
  ];

  const best = candidates.reduce((top, candidate) =>
    candidate.score > top.score ? candidate : top,
  );

  return best.score >= ACTION_THRESHOLD ? best.action : null;
}

/**
 * 今 `ATTACK` を出してよいか。
 *
 * 射程外では出さない。加えて、危険が迫っているときは3段目へ入らない。
 * 3段目は硬直が長く、振り切ると予兆へ反応できないため。
 * `player-state.ts` が入力の受理自体を制御しているので、ここで
 * 連打の間隔を絞る必要はない。
 */
function canStartAttack(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
  weights: NpcWeights,
  scores: ActionScores,
): boolean {
  if (distanceBetween(self.position, snapshot.boss.position) > ATTACK_REACH) return false;

  const swing = self.swing;
  if (swing === null) return true;

  const step = comboStepAt(swing.stepIndex);
  const phase = comboPhaseAt(snapshot.boss.takenAt - swing.startedAt, step);
  // 硬直が明けていなければどのみち受理されない。
  if (phase !== 'DONE') return false;

  // 次が3段目にあたるなら、危険度と慎重さを見て止める判断をする。
  const nextIsFinalStep = swing.stepIndex + 1 === FINAL_COMBO_STEP_INDEX;
  if (nextIsFinalStep && scores.danger * weights.selfPreservation > FINAL_COMBO_STEP_VETO) {
    return false;
  }

  return true;
}

interface MovementContext {
  readonly danger: number;
  readonly target: PlayerSnapshot | null;
}

/**
 * 目標地点を決めて方向ベクトルにする。
 *
 * `moveCharacter` がベクトルを単位長へ正規化するので、**方向だけを出して
 * 大きさは `CHARACTER_STATS.moveSpeed` に任せる**。重みでベクトルを伸縮させても
 * 速さは変わらないため意味がない。
 */
function decideMovement(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
  weights: NpcWeights,
  context: MovementContext,
): MovementInput {
  const goal = decideGoal(snapshot, self, weights, context);
  if (goal === null) return NO_MOVEMENT;
  return directionTowards(self.position, goal);
}

function decideGoal(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
  weights: NpcWeights,
  context: MovementContext,
): PlanarPosition | null {
  // 追尾ビームに狙われている間は、とにかく走って距離を稼ぐ (§9.2)。
  if (isTrackedByBeam(snapshot, self.id)) {
    return fleeFrom(self.position, snapshot.boss.position);
  }

  // 危険範囲を踏んでいるなら、まず外へ出る。回避が使えないときの主手段。
  if (context.danger > 0) {
    const escape = nearestSafePosition(snapshot, self);
    if (escape !== null) return escape;
  }

  const { target } = context;
  if (target !== null) {
    const rescue = rescueScore(snapshot, self, target) * weights.rescue;
    const attack = attackScore(snapshot, self) * weights.aggression;
    if (rescue >= attack) {
      // 届いていれば止まる。通り過ぎると蘇生が途切れる。
      return isWithinReviveRange(self, target) ? null : target.position;
    }
  }

  return approachBoss(snapshot, self, weights);
}

/**
 * ボスへの間合い。`spacing` が大きいほど遠くで止まる。
 *
 * 射程の内側へ入り込みすぎると、RING 系の技で逃げ場を失う。
 */
function approachBoss(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
  weights: NpcWeights,
): PlanarPosition | null {
  const boss = snapshot.boss.position;
  const distance = distanceBetween(self.position, boss);
  const preferred = ATTACK_REACH * clamp01(weights.spacing) + ATTACK_REACH * 0.5;

  // 間合いに収まっていれば動かない。
  if (Math.abs(distance - preferred) < 0.5) return null;
  if (distance > preferred) return boss;
  return fleeFrom(self.position, boss);
}

/** `from` の反対側へ向かう地点。アリーナの外へは出さない。 */
function fleeFrom(position: PlanarPosition, from: PlanarPosition): PlanarPosition {
  const dx = position.x - from.x;
  const dz = position.z - from.z;
  const length = Math.hypot(dx, dz);
  // 真上に重なっているときは向きが決まらない。+Z へ逃がす。
  if (length < 1e-6) return { x: position.x, z: position.z + 1 };

  const scale = ARENA_RADIUS / length;
  return clampToArena({ x: from.x + dx * scale, z: from.z + dz * scale });
}

/**
 * 危険範囲の外で一番近い地点。
 *
 * 範囲の形を解かず、周囲をサンプリングして選ぶ。`WAKE_UP_ALARM` の RING の
 * ように「内側へ潜る」のが正解の形もあるため、外向きへ逃げる決め打ちにしない。
 * 危険範囲は `isInsideDangerZone` に任せているので、技が増えてもここは変わらない。
 */
function nearestSafePosition(
  snapshot: BattleSnapshot,
  self: PlayerSnapshot,
): PlanarPosition | null {
  const zones = dangerZonesFor(snapshot);
  if (zones.length === 0) return null;

  const directions = 12;
  const radii = [3, 6, 10, 15];

  let best: { position: PlanarPosition; distance: number } | null = null;

  for (const radius of radii) {
    for (let index = 0; index < directions; index += 1) {
      const angle = (index / directions) * Math.PI * 2;
      const candidate = clampToArena({
        x: self.position.x + Math.cos(angle) * radius,
        z: self.position.z + Math.sin(angle) * radius,
      });
      if (isInAnyDangerZone(zones, candidate)) continue;

      const distance = distanceBetween(self.position, candidate);
      if (best === null || distance < best.distance) best = { position: candidate, distance };
    }
    // 近い半径で安全な地点が見つかったら、それ以上遠くは探さない。
    if (best !== null) return best.position;
  }

  // どの半径にも安全な地点が無い (全方位が危険範囲)。移動では解決できない。
  return null;
}

function clampToArena(position: PlanarPosition): PlanarPosition {
  const length = Math.hypot(position.x, position.z);
  if (length <= ARENA_RADIUS) return position;
  const scale = ARENA_RADIUS / length;
  return { x: position.x * scale, z: position.z * scale };
}

/**
 * 目標への方向。`MovementInput` は -1〜1 の成分で、`moveCharacter` が
 * 単位長へ正規化する。
 *
 * **`forward` の正方向は -Z**。`moveCharacter` が
 * `z: position.z - (forward / length) * distance` と引き算しているため
 * (カメラが +Z 側から原点を見る座標系)。`forward: dz` と素直に書くと
 * NPC が目標から遠ざかる向きへ走るので、符号を反転させる。
 */
function directionTowards(from: PlanarPosition, to: PlanarPosition): MovementInput {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return NO_MOVEMENT;
  return { forward: -dz / length, right: dx / length };
}
