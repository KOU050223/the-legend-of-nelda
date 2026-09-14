import type { MovementInput } from '../movement/types';

/**
 * Phase 2 の全入力源が落ちてくる共通アクション。
 * docs/phase2-ora-input-spec.md / #52 P2。
 *
 * ```text
 * Input Source → Input Adapter → GameAction → Game Logic
 * ```
 *
 * Keyboard も ARマーカー (オラ大輔) もマイクも、ここへ変換してから
 * Game Logic へ渡す。Game Logic は入力元を知らない
 * (docs/phase2-gameplay-spec.md §16 / docs/technical-design.md §5.2)。
 *
 * ## Phase 1 の `PlayerAction` との関係: 併存させる
 *
 * 置換しない。`PlayerAction` は `DODGE_LEFT / DODGE_RIGHT / GUARD / ATTACK`
 * の4値で、Phase 1 の戦闘一式 (combat-session / judge / state-machine /
 * Hud) がそれを前提に動いている。Phase 2 は別シーンとして立ち上がるので、
 * Phase 1 が生きているあいだ両方を残す。
 *
 * Phase 1 を畳むときに `PlayerAction` ごと消せるよう、Phase 2 側のコードは
 * `PlayerAction` を import しない。
 *
 * ## 離散アクションと連続値
 *
 * `MOVE` だけが連続値 (方向ベクトル) を持ち、他は押した瞬間の離散イベント。
 * union の判別子を `type` に統一してあるので、同期で送るときも
 * 1つの配列へ混ぜて順序を保てる。
 */

/** 移動以外の、押した瞬間に1回だけ発生するアクション。 */
export const DISCRETE_GAME_ACTIONS = [
  'ATTACK',
  'DODGE',
  'INTERACT',
  /** 倒れた仲間を起こす連打入力。docs/phase2-gameplay-spec.md §5.3。 */
  'REVIVE',
  /**
   * キャラクター固有アクション。誰のアクションかは操作中のキャラで決まるので、
   * ここではキャラ名を含めない (オラ大輔なら `ORA_ACTION` に相当する)。
   * #52 P2 の共通Action表がこの名前。
   */
  'CHARACTER_ACTION',
] as const;

export type DiscreteGameActionType = (typeof DISCRETE_GAME_ACTIONS)[number];

export type GameAction =
  /** 移動入力。押しっぱなしのあいだ毎フレーム発生する。 */
  { type: 'MOVE'; input: MovementInput } | { type: DiscreteGameActionType };

export type GameActionType = GameAction['type'];

export function isDiscreteGameActionType(value: string): value is DiscreteGameActionType {
  return (DISCRETE_GAME_ACTIONS as readonly string[]).includes(value);
}

/**
 * 入力源の共通形。
 *
 * - `GameAction` だけを通知する (ブラウザ固有型を Game Logic へ渡さない)
 * - 購読解除関数を返す
 *
 * この2点を型で縛っておくと、ARマーカー / マイクの Adapter を後から足すとき、
 * 満たすべき形がここを見れば分かる (#55 完了条件)。
 */
export type GameActionListener = (action: GameAction) => void;

export interface InputAdapter {
  /** 購読を解除する。 */
  detach(): void;
}

export type AttachInputAdapter = (onAction: GameActionListener) => InputAdapter;
