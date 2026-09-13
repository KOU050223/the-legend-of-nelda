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
  | { type: 'ATTACK_VISUAL_CUE'; attackId: string; cue: string; durationMs?: number }
  | { type: 'ATTACK_AUDIO_CUE'; attackId: string; cue: string; durationMs?: number }
  | { type: 'ATTACK_HIT_TIMING'; attackId: string; at: number }
  | { type: 'ATTACK_ENDED'; attackId: string }
  | { type: 'JUDGED'; result: JudgeResult }
  | { type: 'COMBAT_STATE_CHANGED'; from: CombatState; to: CombatState }
  | { type: 'INPUT_REJECTED'; action: PlayerAction; reason: InputRejectionReason }
  | { type: 'BOSS_HP_CHANGED'; hp: number }
  | { type: 'SLEEPINESS_CHANGED'; value: number };

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
