import { type AttackTiming, judgePlayerAction } from '../combat/judge';
import {
  createPlayerInputGate,
  isDefensiveAction,
  type InputAcceptance,
  type PlayerInputGate,
} from '../combat/player-input';
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
  /**
   * プレイヤー入力を1つ受ける。行動の種別で経路が分かれる。
   *
   * - 回避 / ガード → 受付ウィンドウと再入力ロックを見て、判定へ回す入力を決める
   * - 攻撃 → COUNTER_WINDOW 中なら反撃、そうでなければ空振り (WHIFF)
   *
   * @returns 入力を受理したか、しなかったならなぜか。
   */
  submitAction(action: PlayerAction): InputAcceptance;
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
  /** 硬直・再入力ロックを持つゲート。省略時は仕様の既定値で作る。 */
  inputGate?: PlayerInputGate;
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
  inputGate = createPlayerInputGate({ clock }),
}: BossAttackControllerOptions): BossAttackController {
  let activeAttack: {
    definition: BossAttack;
    hitAt: number | null;
    hitTimingEmitted: boolean;
  } | null = null;
  /** 判定へ回す防御入力。受付ウィンドウ内で受理できたものだけが入る。 */
  let submittedAction: { action: PlayerAction; inputAt: number } | null = null;

  /**
   * ATTACK 遷移の通知が届く前に着弾予定時刻を求める。
   *
   * TELEGRAPH の期限が ATTACK の論理上の開始時刻なので、そこへ hitAfterMs を
   * 足せば、update() が遅れて呼ばれても実際に配られる hitAt と同じ値になる。
   * TELEGRAPH 以外では逆算できないため null を返す。
   */
  function scheduledHitAt(attack: BossAttack): number | null {
    if (machine.state !== 'TELEGRAPH') {
      return null;
    }

    const deadline = machine.stateDeadline;

    return deadline === null ? null : deadline + attack.hitTiming.hitAfterMs;
  }

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
      // 予兆の尺を Cue へ添える。Presentation 側が TELEGRAPH の長さを
      // ハードコードで二重に持たずに済ませるためで、技ごとの timings 上書きや
      // バランス調整がそのまま届く (docs/single-player-poc-spec.md §8 の
      // 「発射直前の約0.15秒の無音」)。期限を持たない場合はキーごと省く。
      const deadline = machine.stateDeadline;
      const duration = deadline === null ? null : { durationMs: deadline - startedAt };

      if (attack.cues?.visual !== false && attack.visualCue) {
        eventBus.emit({
          type: 'ATTACK_VISUAL_CUE',
          attackId: attack.id,
          cue: attack.visualCue,
          ...duration,
        });
      }
      if (attack.cues?.audio !== false && attack.audioCue) {
        eventBus.emit({
          type: 'ATTACK_AUDIO_CUE',
          attackId: attack.id,
          cue: attack.audioCue,
          ...duration,
        });
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
      const finishedAttackId = attack.id;
      activeAttack = null;
      submittedAction = null;
      // 硬直はここで解かない。WHIFF / 早押しの硬直はサイクルの切れ目を跨いで
      // 効くのが仕様の意図で、境界でリセットすると硬直時間が観測できなくなる。
      eventBus.emit({ type: 'ATTACK_ENDED', attackId: finishedAttackId });
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
      // 攻撃は着弾タイミングではなく COUNTER_WINDOW に対して判定する。
      // 技選択ミス (被弾) は防御3択の取り違えであって、攻撃は常に反撃経路
      // (docs/single-player-poc-spec.md §13 / INPUT-014)。
      if (!isDefensiveAction(action)) {
        const acceptance = inputGate.submitAttack(machine.state === 'COUNTER_WINDOW');

        if (acceptance === 'WHIFF') {
          eventBus.emit({ type: 'INPUT_REJECTED', action, reason: 'WHIFF' });
          return acceptance;
        }

        // COUNTER_WINDOW を見てから反撃を渡しているので通常は成立するが、
        // 拒否された場合に成功を返さない。State Machine 側を真実源にしておく。
        if (acceptance === 'ACCEPTED' && !machine.registerCounter()) {
          return 'LOCKED';
        }

        return acceptance;
      }

      const active = activeAttack;

      // 攻撃サイクル外の防御入力は判定対象を持たない。硬直も残さず捨てる。
      if (!active || (machine.state !== 'TELEGRAPH' && machine.state !== 'ATTACK')) {
        return 'LOCKED';
      }

      // 受付開始は着弾時刻から逆算する。ATTACK へ入る前でも、TELEGRAPH の
      // 期限から着弾予定が分かるので、フレーム落ちで ATTACK 遷移の通知が
      // 遅れても受付開始の判断は変わらない。
      const hitAt = active.hitAt ?? scheduledHitAt(active.definition);

      const inWindow =
        hitAt !== null && clock.now() - hitAt >= active.definition.hitTiming.acceptFromMs;

      const acceptance = inputGate.submitDefensive(action, inWindow);

      if (acceptance === 'ACCEPTED') {
        submittedAction = { action, inputAt: clock.now() };
        return acceptance;
      }

      if (acceptance === 'TOO_EARLY') {
        // 早押しは判定へ回さない。被弾させず硬直だけを残すため、
        // submittedAction は空のままにして JUDGE では「入力なし」として扱う。
        eventBus.emit({ type: 'INPUT_REJECTED', action, reason: 'TOO_EARLY' });
      }

      return acceptance;
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
