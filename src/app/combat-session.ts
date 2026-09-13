import { createBossAttackController, type BossAttack } from '@/game/attacks/boss-attack';
import { createFluffyFutonAttack } from '@/game/attacks/fluffy-futon';
import { createPillowSweep } from '@/game/attacks/pillow-sweep';
import { yawnWave } from '@/game/attacks/yawn-wave';
import { createRealClock, type GameClock } from '@/game/clock';
import { createCombatStateMachine } from '@/game/combat/state-machine';
import { createCombatVitals } from '@/game/combat/vitals';
import { createGameEventBus, type GameEventBus } from '@/game/events/game-event';
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
}

/**
 * Phase 1 の攻撃順。
 *
 * 出題の設計 (頻度・難易度カーブ・連携) は仕様がまだ定めていないため、
 * ここでは定義済みの3技を順に出すだけの暫定実装にする。HUD が実際の戦闘
 * イベントで動くことを確かめるための最小構成で、出題ロジックそのものは
 * 別Issueで詰める。
 */
function createAttackRotation(random: () => number): () => BossAttack {
  const factories: ReadonlyArray<() => BossAttack> = [
    () => createPillowSweep({ random }),
    () => yawnWave,
    () => createFluffyFutonAttack({ random }),
  ];

  let next = 0;

  return () => {
    // 剰余で必ず範囲内に収まるが、配列アクセスの型を絞るために既定を置く。
    const factory = factories[next % factories.length] ?? factories[0]!;
    next += 1;
    return factory();
  };
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

  // ゲージの分母は戦闘生成時の設定値。表示側が既定値を直接読むと、
  // 上限を変えたときに割合がずれる。
  useGameStore.getState().setVitalsMaximums({
    bossHpMax: vitals.bossHpMax,
    sleepinessMax: vitals.sleepinessMax,
  });

  const unsubscribeHud = syncHudWithGameEvents(eventBus);
  const nextAttack = createAttackRotation(random);

  const stopLoop = frameLoop(() => {
    controller.update();
    machine.update();

    // IDLE は次の技を待つ状態。戦闘が終わっていれば startAttack が false を
    // 返すのでここでは State だけを見る。
    if (machine.state === 'IDLE') {
      controller.start(nextAttack());
    }
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
