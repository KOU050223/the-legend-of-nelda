import type { BossPhase } from '../boss/boss-phase';
import type { HoriAttackId } from '../config/phase2-boss-balance';
import type { SequencePhase } from '../sequence/attack-sequence';
import type { CombatState, JudgeResult } from '../types/combat-state';
import type { PlayerAction } from '../types/player-action';

/**
 * 入力が受理されなかった理由のうち、プレイヤーへ提示するもの。
 * ロック中に捨てた入力は演出を持たないため含めない
 * (docs/single-player-poc-spec.md §13 / UI-005 / UI-006)。
 */
export type InputRejectionReason = 'TOO_EARLY' | 'WHIFF';

/**
 * Game Logic が発行するイベント。
 * Rendering / Audio / UI がそれぞれ購読する。
 * Game Logic から Audio API や Three.js を直接呼ばないための境界。
 * (docs/technical-design.md §6 / §15)
 *
 * Visual Cue と Audio Cue は別イベントに分ける。片方だけを購読する
 * レイヤーへもう片方の情報を渡さないためで、Phase 2 で
 * 見ざる / 聞かざる へ Cue を出し分ける際の前提になる
 * (docs/technical-design.md §6 / docs/testing-strategy.md §7)。
 *
 * Cue は `durationMs` に予兆 (TELEGRAPH) の尺を添える。あくび衝撃波の
 * 「発射直前の約0.15秒の無音」のように、Cue を受けた Audio / Rendering 側が
 * 着弾から逆算して多拍の分節を組み立てる必要があるため
 * (docs/single-player-poc-spec.md §8)。尺を持たせないと Presentation 側が
 * TELEGRAPH の長さを二重に持つことになり、バランス調整でずれる。
 * Cue ID 自体は1技につき1つのまま変えない。
 *
 * COMBAT_STATE_CHANGED は State Machine の遷移をそのまま流す。UI は
 * BOSS_DOWN のような State 依存の演出をこれ1本で知り、State Machine を
 * 直接参照しない (docs/technical-design.md §9 の一方向データフロー)。
 */
export type GameEvent =
  | { type: 'ATTACK_STARTED'; attackId: string }
  | {
      /**
       * シーケンスが1手進んだ。チュートリアルの補助表示は、UI がこの
       * イベントだけを見て切り替える。UI から Attack Sequence を直接
       * 引かせないための唯一の経路 (docs/technical-design.md §9)。
       */
      type: 'SEQUENCE_STEP_STARTED';
      phase: SequencePhase;
      /** 操作補助表示を出す手か (SEQ-003)。本戦では常に false (SEQ-004)。 */
      assist: boolean;
      attackId: string;
      /** シーケンス全体を通した0始まりの通し番号。 */
      stepIndex: number;
    }
  | {
      type: 'ATTACK_VISUAL_CUE';
      attackId: string;
      cue: string;
      durationMs?: number;
      /**
       * どの局面の Cue か。省略時は予兆 (TELEGRAPH)。
       *
       * 枕の軌跡やあくびの衝撃波は、予兆中に出すと発動前に尺が尽きて消える
       * (仕様の「発動」区分でのみ描かれる演出のため)。Cue ID 自体は技につき
       * 1つのまま (game-event.ts 冒頭のコメント) で、ATTACK State 開始時に
       * 同じ Cue を `ACTIVATION` として再送する。
       */
      phase?: 'ACTIVATION';
    }
  | { type: 'ATTACK_AUDIO_CUE'; attackId: string; cue: string; durationMs?: number }
  | { type: 'ATTACK_HIT_TIMING'; attackId: string; at: number }
  | { type: 'ATTACK_ENDED'; attackId: string }
  | { type: 'JUDGED'; result: JudgeResult }
  | { type: 'COMBAT_STATE_CHANGED'; from: CombatState; to: CombatState }
  | { type: 'INPUT_REJECTED'; action: PlayerAction; reason: InputRejectionReason }
  /**
   * BOSS_DOWN 中の追撃が命中した。State は BOSS_DOWN のまま進まないため
   * (COMBAT_STATE_CHANGED を再発火すると DAMAGE の演出が重複する)、
   * ダメージが実際に入ったことを Audio / VFX へ知らせる専用イベント。
   */
  | { type: 'BOSS_DOWN_FOLLOW_UP_HIT' }
  | { type: 'BOSS_HP_CHANGED'; hp: number }
  | { type: 'SLEEPINESS_CHANGED'; value: number }
  /**
   * ここから下は Phase 2 のボス (堀大輔) が発行する
   * (docs/phase2-gameplay-spec.md §8〜§12)。Phase 1 のイベントとは
   * 併用しない。Phase 1 は1対1・1度に1攻撃サイクルの前提で、
   * 3人が同時に動く Phase 2 の戦闘には attackId だけでは足りない
   * (誰に当たったかを持つ必要がある)。
   *
   * 同じ Bus へ相乗りさせているのは、購読側 (UI / Audio / VFX) を
   * 2系統に割りたくないため。既存の購読者はすべて default 節を持つので、
   * Phase 2 のイベントは無視される。
   */
  /**
   * Phase 2 のボスHP。Phase 1 の BOSS_HP_CHANGED とは別イベントにする。
   *
   * あちらは分母が `INITIAL_BOSS_HP` (100) であることを購読側が前提にしており
   * (game-store の bossHpMax 既定値)、堀大輔のHP (HORI_INITIAL_HP = 1000) を
   * そのまま流すとゲージが 900% を指す。分母をイベント自身へ持たせて、
   * 購読側が設定値を直接読まなくても割合を出せるようにする。
   */
  | { type: 'HORI_HP_CHANGED'; hp: number; hpMax: number }
  | { type: 'BOSS_PHASE_CHANGED'; from: BossPhase; to: BossPhase }
  | { type: 'BOSS_ATTACK_STARTED'; attackId: HoriAttackId; telegraphMs: number }
  /**
   * 予兆が明けて判定 (ACTIVE) が出た。技が実際に「出る」瞬間。
   *
   * `BOSS_ATTACK_STARTED` は予兆の頭で流れるので、着弾の瞬間に鳴らしたい音
   * (絶対起床アラームの衝撃波) はそちらでは早すぎる。処理落ちで ACTIVE の尺を
   * まるごと飛ばした場合も、判定と同じく1回だけ流す。
   */
  | { type: 'BOSS_ATTACK_ACTIVE'; attackId: HoriAttackId }
  | { type: 'BOSS_ATTACK_HIT'; attackId: HoriAttackId; targetId: string; damage: number }
  | { type: 'BOSS_ATTACK_ENDED'; attackId: HoriAttackId }
  /** 結界中 / NO SLEEP MODE で攻撃が通らなかった。0 DAMAGE 表示の起点。 */
  | { type: 'BOSS_DAMAGE_NULLIFIED'; phase: BossPhase }
  | { type: 'BOSS_DOWN_STARTED'; durationMs: number }
  | { type: 'BOSS_DOWN_ENDED' };

export type GameEventListener = (event: GameEvent) => void;

export interface GameEventBus {
  emit(event: GameEvent): void;
  subscribe(listener: GameEventListener): () => void;
}

export function createGameEventBus(): GameEventBus {
  const listeners = new Set<GameEventListener>();

  return {
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
