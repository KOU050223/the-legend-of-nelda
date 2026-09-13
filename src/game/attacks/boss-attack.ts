import { type AttackTiming, judgePlayerAction } from '../combat/judge';
import {
  type CombatAttack,
  type CombatStateMachine,
  type JudgementOutcome,
} from '../combat/state-machine';
import type { CombatVitals } from '../combat/vitals';
import type { GameClock } from '../clock';
import type { AttackId } from '../config/combat-balance';
import type { GameEventBus } from '../events/game-event';
import type { PlayerAction } from '../types/player-action';

/** 攻撃が向かう方向。中央へ放つ攻撃は CENTER として表す。 */
export type AttackDirection = 'LEFT' | 'RIGHT' | 'CENTER';

/** 個別技の実装前でもダミー技を載せられるよう、種別は拡張可能な文字列にする。 */
export type AttackType = AttackId | 'DUMMY';

/** 視覚・音声の情報提示を独立して切り替える設定。省略時は両方有効。 */
export interface AttackCueSettings {
  visual?: boolean;
  audio?: boolean;
}

/** ATTACK State に入ってからの着弾時刻と、入力判定に使う受付幅。 */
export interface BossAttackHitTiming extends Omit<AttackTiming, 'hitAt' | 'correctAction'> {
  /** ATTACK State の開始から着弾までの時間 (ms)。 */
  hitAfterMs: number;
}

/**
 * Boss Attack の共通定義。ゲームルールと Presentation へ渡す Cue を一つに集約する。
 *
 * Cue は文字列の識別子だけを持ち、SE再生や描画を直接行わない。購読する Rendering /
 * Audio レイヤーが実際の表現を担当するため、Phase 2 で配信先を分離できる。
 */
export interface BossAttack extends CombatAttack {
  id: AttackType;
  type: AttackType;
  direction: AttackDirection;
  visualCue?: string;
  audioCue?: string;
  hitTiming: BossAttackHitTiming;
  correctAction: PlayerAction;
  counterWindowMs: number;
  damage: number;
  sleepinessDamage: number;
  cues?: AttackCueSettings;
}

/** State Machine が扱う攻撃へ、技ごとの反撃時間を反映する。 */
function toCombatAttack(attack: BossAttack): CombatAttack {
  return {
    ...attack,
    timings: {
      ...attack.timings,
      ATTACK: attack.hitTiming.hitAfterMs + attack.hitTiming.acceptToMs,
      COUNTER_WINDOW: attack.counterWindowMs,
    },
  };
}

/**
 * 攻撃定義を生成する。定義自体は副作用を持たず、テストや各技の実装から再利用できる。
 */
export function defineBossAttack(attack: BossAttack): BossAttack {
  const definition: BossAttack = {
    ...attack,
    hitTiming: { ...attack.hitTiming },
    timings: {
      ...attack.timings,
      ATTACK: attack.hitTiming.hitAfterMs + attack.hitTiming.acceptToMs,
      COUNTER_WINDOW: attack.counterWindowMs,
    },
  };

  if (attack.cues) {
    return { ...definition, cues: { ...attack.cues } };
  }

  return definition;
}

export interface BossAttackController {
  /** IDLE 中に攻撃を開始し、Cue をイベントとして発行する。 */
  start(attack: BossAttack): boolean;
  /** TELEGRAPH / ATTACK 中の最初の入力を保持する。 */
  submitAction(action: PlayerAction): boolean;
  /** State Machine から注入して使う入力判定。 */
  resolveJudgement(attack: CombatAttack): JudgementOutcome;
  /** COUNTER_WINDOW 中の反撃を成立させる。 */
  registerCounter(): boolean;
  /** 着弾予定を確認し、到達済みなら Hit Timing Event を発行する。 */
  update(): void;
  /** State Machine の寿命に合わせて購読を解除する。 */
  dispose(): void;
}

export interface BossAttackControllerOptions {
  clock: GameClock;
  machine: CombatStateMachine;
  vitals: CombatVitals;
  eventBus: GameEventBus;
}

/**
 * 共通攻撃を State Machine・入力判定・Vitals・Cue Event へ接続する。
 * Presentation への依存は GameEventBus の発行だけに留める。
 */
export function createBossAttackController({
  clock,
  machine,
  vitals,
  eventBus,
}: BossAttackControllerOptions): BossAttackController {
  let activeAttack: {
    definition: BossAttack;
    hitAt: number | null;
    hitTimingEmitted: boolean;
  } | null = null;
  let submittedAction: { action: PlayerAction; inputAt: number } | null = null;

  function emitHitTiming(active: NonNullable<typeof activeAttack>): void {
    if (active.hitAt === null || active.hitTimingEmitted) {
      return;
    }

    eventBus.emit({ type: 'ATTACK_HIT_TIMING', attackId: active.definition.id, at: active.hitAt });
    active.hitTimingEmitted = true;
  }

  const unsubscribe = machine.onTransition(({ to, startedAt }) => {
    const active = activeAttack;
    if (!active) {
      return;
    }
    const { definition: attack } = active;

    if (to === 'TELEGRAPH') {
      if (attack.cues?.visual !== false && attack.visualCue) {
        eventBus.emit({ type: 'ATTACK_VISUAL_CUE', attackId: attack.id, cue: attack.visualCue });
      }
      if (attack.cues?.audio !== false && attack.audioCue) {
        eventBus.emit({ type: 'ATTACK_AUDIO_CUE', attackId: attack.id, cue: attack.audioCue });
      }
      return;
    }

    if (to === 'ATTACK') {
      active.hitAt = startedAt + attack.hitTiming.hitAfterMs;
      return;
    }

    if (to === 'JUDGE') {
      emitHitTiming(active);
      return;
    }

    if (to === 'HIT') {
      vitals.addSleepiness(attack.sleepinessDamage);
      return;
    }

    if (to === 'DAMAGE') {
      vitals.damageBoss(attack.damage);
      return;
    }

    if (to === 'IDLE' || to === 'BOSS_DEFEATED' || to === 'PLAYER_LOSE') {
      eventBus.emit({ type: 'ATTACK_ENDED', attackId: attack.id });
      activeAttack = null;
      submittedAction = null;
    }
  });

  return {
    start(attack) {
      if (machine.state !== 'IDLE') {
        return false;
      }

      activeAttack = {
        definition: attack,
        hitAt: null,
        hitTimingEmitted: false,
      };
      submittedAction = null;

      eventBus.emit({ type: 'ATTACK_STARTED', attackId: attack.id });
      const started = machine.startAttack(toCombatAttack(attack));
      if (!started) {
        activeAttack = null;
      }

      return started;
    },

    submitAction(action) {
      if (
        !activeAttack ||
        submittedAction ||
        (machine.state !== 'TELEGRAPH' && machine.state !== 'ATTACK')
      ) {
        return false;
      }

      submittedAction = { action, inputAt: clock.now() };
      return true;
    },

    resolveJudgement(attack) {
      if (
        !activeAttack ||
        attack.id !== activeAttack.definition.id ||
        activeAttack.hitAt === null ||
        !submittedAction
      ) {
        return 'FAILURE';
      }

      const result = judgePlayerAction({
        attack: {
          ...activeAttack.definition.hitTiming,
          hitAt: activeAttack.hitAt,
          correctAction: activeAttack.definition.correctAction,
        },
        ...submittedAction,
      });
      eventBus.emit({ type: 'JUDGED', result });

      return result === 'PERFECT_DODGE' || result === 'JUST_GUARD' ? 'SUCCESS' : 'FAILURE';
    },

    registerCounter() {
      return machine.registerCounter();
    },

    update() {
      if (activeAttack && activeAttack.hitAt !== null && clock.now() >= activeAttack.hitAt) {
        emitHitTiming(activeAttack);
      }
    },

    dispose() {
      unsubscribe();
      activeAttack = null;
      submittedAction = null;
    },
  };
}
