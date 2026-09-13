import { create } from 'zustand';

import { INITIAL_BOSS_HP, INITIAL_SLEEPINESS, MAX_SLEEPINESS } from '@/game/config/combat-balance';
import type { AttackId } from '@/game/config/combat-balance';
import type { InputRejectionReason } from '@/game/events/game-event';
import type { SequencePhase } from '@/game/sequence/attack-sequence';
import type { CombatState, JudgeResult, PlayerAction } from '@/game/types';

/**
 * 画面に出す直近のイベント。
 *
 * 判定結果・反撃成立・弾かれた入力は表示上の帰結が違うので、1つの値の
 * 種別として持つ。文言を決める材料 (技ID) を判定時点の値へ畳み込んでおくと、
 * 次の技が始まったあとに古い結果を新しい技IDで解釈し直す余地が無くなる
 * (UI-008)。
 */
export type EventFeedback =
  | { kind: 'RESULT'; result: JudgeResult; attackId: AttackId | null }
  | { kind: 'COUNTER' }
  | { kind: 'REJECTION'; reason: InputRejectionReason };

/**
 * 表示のために共有する状態。docs/technical-design.md §9。
 * Presentation State が Game Logic を書き換えないよう、
 * 戦闘ルールそのものはここではなく src/game/ 側へ置く。
 */
interface GameStore {
  combatState: CombatState;
  bossHp: number;
  /** ボスHPゲージの分母。戦闘生成時の設定値をそのまま持つ。 */
  bossHpMax: number;
  sleepiness: number;
  /** SLEEPINESS の割合表示の分母 (= 敗北しきい値)。 */
  sleepinessMax: number;
  lastAction: PlayerAction | null;
  /** 進行中の技。判定時にイベントへ畳み込む文言選択用の情報。 */
  lastAttackId: AttackId | null;
  /** 進行中の段。チュートリアルか本戦か。 */
  sequencePhase: SequencePhase;
  /** 操作補助表示を出す手か。本戦では常に false (SEQ-004)。 */
  assistVisible: boolean;
  /** 画面に出す直近のイベント。出し終えた / 次の技が始まった時点で null に戻す。 */
  eventFeedback: EventFeedback | null;
  /** 同じ文言の連続イベントも再表示するための単調増加ID。 */
  eventSequence: number;

  setCombatState: (state: CombatState) => void;
  setBossHp: (hp: number) => void;
  setSleepiness: (value: number) => void;
  /** 戦闘生成時の上限値を表示側へ渡す。 */
  setVitalsMaximums: (maximums: { bossHpMax: number; sleepinessMax: number }) => void;
  /** 表示済みのイベントフィードバックを捨てる。次の攻撃へ持ち越さないため。 */
  clearEventFeedback: () => void;
  recordAction: (action: PlayerAction) => void;
  recordAttack: (attackId: AttackId | null) => void;
  /** シーケンスが1手進んだことを表示側へ反映する。 */
  recordSequenceStep: (step: { phase: SequencePhase; assist: boolean }) => void;
  recordInputRejection: (reason: InputRejectionReason) => void;
  recordResult: (result: JudgeResult) => void;
  /** 反撃成立 (大ダウン) を表示イベントとして記録する。 */
  recordCounter: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  combatState: 'INTRO',
  bossHp: INITIAL_BOSS_HP,
  bossHpMax: INITIAL_BOSS_HP,
  sleepiness: INITIAL_SLEEPINESS,
  sleepinessMax: MAX_SLEEPINESS,
  lastAction: null,
  lastAttackId: null,
  // チュートリアルから始まる。補助表示は最初の手が始まるまで出さない。
  sequencePhase: 'TUTORIAL',
  assistVisible: false,
  eventFeedback: null,
  eventSequence: 0,

  setCombatState: (combatState) => set({ combatState }),
  setBossHp: (bossHp) => set({ bossHp }),
  setSleepiness: (sleepiness) => set({ sleepiness }),
  setVitalsMaximums: ({ bossHpMax, sleepinessMax }) => set({ bossHpMax, sleepinessMax }),
  // 表示を消すだけなので eventSequence は進めない。次に出すイベントが
  // 自分で番号を進める。
  clearEventFeedback: () => set({ eventFeedback: null }),
  recordAction: (lastAction) => set({ lastAction }),
  // 新しい技が始まった時点で前の技のフィードバックを捨てる。残したままだと
  // 表示が次の攻撃へ持ち越される (UI-008)。
  recordAttack: (lastAttackId) => set({ lastAttackId, eventFeedback: null }),
  recordSequenceStep: ({ phase, assist }) => set({ sequencePhase: phase, assistVisible: assist }),
  recordInputRejection: (reason) =>
    set((state) => ({
      eventFeedback: { kind: 'REJECTION', reason },
      eventSequence: state.eventSequence + 1,
    })),
  recordResult: (result) =>
    set((state) => ({
      // 文言の材料をこの時点の技IDで確定させる。あとから技が変わっても
      // 表示済みの結果が別の技として解釈され直さない。
      eventFeedback: { kind: 'RESULT', result, attackId: state.lastAttackId },
      eventSequence: state.eventSequence + 1,
    })),
  recordCounter: () =>
    set((state) => ({
      eventFeedback: { kind: 'COUNTER' },
      eventSequence: state.eventSequence + 1,
    })),
}));
