import { createBossAttackController } from '@/game/attacks/boss-attack';
import { createRealClock, type GameClock } from '@/game/clock';
import { createCombatStateMachine } from '@/game/combat/state-machine';
import { createCombatVitals } from '@/game/combat/vitals';
import { createGameEventBus, type GameEventBus } from '@/game/events/game-event';
import {
  createAttackSequence,
  type AttackSequence,
  type SequenceStepDefinition,
} from '@/game/sequence/attack-sequence';
import type { PlayerAction } from '@/game/types';
import { useGameStore } from '@/store/game-store';
import { syncHudWithGameEvents } from '@/ui/hud/game-event-sync';

/**
 * 1フレーム進める指示を受け取る側。テストから rAF を使わずに回せるよう、
 * ループの駆動そのものを差し替え可能にする。
 *
 * @returns ループの停止関数
 */
export type FrameLoop = (onFrame: () => void) => () => void;

function requestAnimationFrameLoop(onFrame: () => void): () => void {
  let handle = requestAnimationFrame(function tick() {
    onFrame();
    handle = requestAnimationFrame(tick);
  });

  return () => cancelAnimationFrame(handle);
}

export interface CombatSession {
  /** プレイヤー入力を戦闘へ渡す。 */
  submitAction: (action: PlayerAction) => void;
  /** Presentation 側が追加購読するためのイベントバス。 */
  readonly eventBus: GameEventBus;
  /** ループ・購読・State Machine の購読をまとめて解く。 */
  dispose: () => void;
}

export interface CombatSessionOptions {
  clock?: GameClock;
  frameLoop?: FrameLoop;
  /** 技の出し分けに使う乱数。テストから固定する。 */
  random?: () => number;
  /** チュートリアル順の差し替え。空配列を渡せばチュートリアルを飛ばせる。 */
  tutorialSequence?: readonly SequenceStepDefinition[];
  /** 本戦の攻撃順の差し替え (完了条件「本戦の攻撃順を設定から調整できる」)。 */
  mainSequence?: readonly SequenceStepDefinition[];
  /** 出題順そのものを差し替える。指定した場合 tutorialSequence / mainSequence は使わない。 */
  sequence?: AttackSequence;
}

/**
 * Game Logic を1つ組み立てて HUD へ接続する。
 *
 * 生成物 (バス / Vitals / State Machine / Controller) はこの関数の中だけで
 * 参照し、外へは入力と破棄だけを出す。Presentation から戦闘ルールを
 * 触らせないため (docs/technical-design.md §5 / §9)。
 */
export function createCombatSession({
  clock = createRealClock(),
  frameLoop = requestAnimationFrameLoop,
  random = Math.random,
  tutorialSequence,
  mainSequence,
  sequence,
}: CombatSessionOptions = {}): CombatSession {
  const eventBus = createGameEventBus();
  const vitals = createCombatVitals({ eventBus });

  let controller: ReturnType<typeof createBossAttackController>;
  const machine = createCombatStateMachine({
    clock,
    resolveJudgement: (attack) => controller.resolveJudgement(attack),
    resolveBattleEnd: vitals.resolveBattleEnd,
  });
  controller = createBossAttackController({ clock, machine, vitals, eventBus });

  const attackSequence =
    sequence ??
    createAttackSequence({
      random,
      // exactOptionalPropertyTypes のため、未指定のキーは渡さずに既定へ任せる。
      ...(tutorialSequence ? { tutorial: tutorialSequence } : {}),
      ...(mainSequence ? { mainBattle: mainSequence } : {}),
    });

  // ゲージの分母は戦闘生成時の設定値。表示側が既定値を直接読むと、
  // 上限を変えたときに割合がずれる。
  useGameStore.getState().setVitalsMaximums({
    bossHpMax: vitals.bossHpMax,
    sleepinessMax: vitals.sleepinessMax,
  });

  // 出題位置も戦闘ごとに初期化する。外から渡されたシーケンスは前の戦闘で
  // 使ったものかもしれず、そのままだと本戦の途中から再開してしまう
  // (RESULT-008 の「Attack Sequence位置」)。
  attackSequence.reset();

  // 進行の表示状態は戦闘ごとに初期化する。store はセッションより長く生きるので、
  // 前の戦闘が本戦の途中や補助表示ありの手で終わっていると、その値のまま
  // 次の INTRO が始まってしまう (仕様 §17 の 0〜5秒は登場演出で、
  // 補助表示を出す区間ではない)。
  useGameStore.getState().recordSequenceStep({ phase: attackSequence.phase, assist: false });

  const unsubscribeHud = syncHudWithGameEvents(eventBus);

  const stopLoop = frameLoop(() => {
    controller.update();
    machine.update();

    // IDLE は次の技を待つ状態。戦闘が終わっていれば startAttack が false を
    // 返すのでここでは State だけを見る。
    if (machine.state !== 'IDLE') {
      return;
    }

    const step = attackSequence.next();

    // シーケンスの情報は攻撃そのものより先に流す。UI が補助表示を
    // 切り替えてから予兆の Cue が届く順にしておくため。
    eventBus.emit({
      type: 'SEQUENCE_STEP_STARTED',
      phase: step.phase,
      assist: step.assist,
      attackId: step.attackId,
      stepIndex: step.index,
    });

    controller.start(step.attack);
  });

  return {
    eventBus,

    submitAction(action) {
      controller.submitAction(action);
    },

    dispose() {
      stopLoop();
      unsubscribeHud();
      controller.dispose();
    },
  };
}
