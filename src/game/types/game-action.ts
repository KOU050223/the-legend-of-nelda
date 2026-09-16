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
  | { type: 'MOVE'; input: MovementInput }
  /** 音声ATTACKだけは声量を任意で載せられる。未指定なら従来どおりの攻撃。 */
  | { type: 'ATTACK'; intensity?: number }
  | { type: Exclude<DiscreteGameActionType, 'ATTACK'> };

export type GameActionType = GameAction['type'];

export function isDiscreteGameActionType(value: string): value is DiscreteGameActionType {
  return (DISCRETE_GAME_ACTIONS as readonly string[]).includes(value);
}

/**
 * 入力源が守る共通の契約。
 *
 * **出力型 `T` をジェネリックにしてある。**全部の入力源が `GameAction` を
 * 出すわけではないため。オカリナ (マイク) は終盤の最終局面だけで使い、
 * 通常戦闘やオラ大輔の通常能力には使わない
 * (docs/phase2-gameplay-spec.md §13)。通常戦闘の `GameAction` へ無理に
 * 対応付けると、仕様が「別途設計する」としている入力方式を先取りで
 * 決めてしまう。
 *
 * 共通化するのは**全ての入力源に等しく要る2点**だけに絞る。
 *
 * - ブラウザ固有型 (KeyboardEvent / MediaStream / AudioContext / PCM) を
 *   Game Logic へ渡さず、正規化した値だけを通知する
 * - 後始末できる (`detach`)
 *
 * 起動は `Promise` を返せる形にしてある。マイクは `getUserMedia` の許可待ち
 * があり同期では繋がらないため。Keyboard のように即座に繋がるものは
 * そのまま返してよい (`Awaitable`)。
 *
 * ARマーカー (#49) を足すときは、`GameAction` を出す
 * `AttachInputAdapter` を満たす形で書けばよい。マイクは
 * `AttachInputAdapter<NoteEvent>` にあたる。
 */
export type GameActionListener = (action: GameAction) => void;

export type InputListener<T> = (value: T) => void;

export interface InputAdapter {
  /** 購読を解除し、握っているリソースを解放する。 */
  detach(): void;
}

/** 同期でも Promise でも返せる。マイクだけが非同期になる。 */
export type Awaitable<T> = T | Promise<T>;

/**
 * 入力源を繋ぐ関数の形。
 * 既定の出力型は `GameAction`（Keyboard / ARマーカー）。
 */
export type AttachInputAdapter<T = GameAction> = (
  onValue: InputListener<T>,
) => Awaitable<InputAdapter>;
