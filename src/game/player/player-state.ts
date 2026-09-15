import { ARENA_BOUNDS } from '@/game/arena/arena';

import {
  ATTACK_REACH,
  CHARACTER_STATS,
  DEFAULT_REVIVAL,
  REVIVE_INPUT_INTERVAL_MS,
  type CharacterId,
} from '../config/phase2-player-balance';
import { facingRotationY, moveCharacter } from '../movement/movement';
import type { MovementInput, PlanarPosition } from '../movement/types';
import type { GameAction } from '../types/game-action';
import {
  comboPhaseAt,
  comboStepAt,
  damageMultiplierForIntensity,
  nextComboStep,
  type ComboSwing,
} from './attack-combo';

/**
 * 1人のプレイヤーの状態。docs/phase2-gameplay-spec.md §4 / §5。
 *
 * `GameAction` を受けて状態を進める。入力元 (Keyboard / ARマーカー / マイク)
 * を知らない (§16)。React / Three.js へも依存しない
 * (docs/technical-design.md §5.1)。
 *
 * キャラ差は `CHARACTER_STATS` を引くだけで、キャラ名での分岐を書かない
 * (#56 完了条件「コード分岐にしない」)。
 */

/** プレイヤーの大きな状態。 */
export type PlayerStatus =
  /** 通常。移動・攻撃・回避ができる。 */
  | 'ACTIVE'
  /** HP0。布団を出して寝ようとしている。仲間が起こせる (§5.2)。 */
  | 'FALLING_ASLEEP'
  /** 完全に寝た。自力では戻らない (§5.5 の敗北判定に数える)。 */
  | 'ASLEEP';

/**
 * 外へ出せるプレイヤーの状態。**JSON でシリアライズできる値だけを持つ**
 * (#56 完了条件「プレイヤー状態がシリアライズ可能なスナップショット」)。
 *
 * ボスの `BossSnapshot` と同じ規律。進行中の状態は経過時間ではなく
 * 絶対時刻で持つので、復元した側が自分の時計と突き合わせられる。
 */
export interface PlayerSnapshot {
  readonly id: string;
  readonly characterId: CharacterId;
  readonly status: PlayerStatus;
  readonly hp: number;
  readonly hpMax: number;
  readonly position: PlanarPosition;
  readonly rotationY: number;
  /** 進行中の連撃。振っていなければ null。 */
  readonly swing: ComboSwing | null;
  /** 無敵が明ける時刻。回避中・復帰直後に立つ。 */
  readonly invulnerableUntil: number | null;
  /** 次に回避できる時刻。 */
  readonly dodgeReadyAt: number;
  /** 寝てしまう時刻。FALLING_ASLEEP のときだけ入る (§5.3)。 */
  readonly sleepAt: number | null;
  /**
   * 蘇生の連打回数。必要回数に届くと起き上がる。
   *
   * 0〜1 の割合ではなく整数の回数で持つ。割合を毎回足していくと
   * 浮動小数の誤差で 0.9999... に留まり、必要回数を連打しても永久に
   * 起き上がらない (soloReviveMs 3500 / 間隔 250 の 14回でちょうど踏む)。
   */
  readonly reviveInputs: number;
  /**
   * 直近に蘇生入力を出した時刻。**救助する側**が持つ。
   *
   * 連打の間隔を `REVIVE_INPUT_INTERVAL_MS` で頭打ちにするために持つ。
   * 回数だけ数えると、キーを高速連打したりプログラムから叩いたりすれば
   * 3.5秒のはずの蘇生が一瞬で終わる (§5.3 の時間設定が意味を失う)。
   *
   * 倒れている側ではなく救助する側に置くのは、2人で起こすときに
   * 片方の入力がもう片方を弾かないようにするため。人数ぶん速くなるという
   * §5.3 の設計はここで担保される。
   */
  readonly lastReviveAt: number | null;
  /**
   * 押しっぱなしの移動入力。
   *
   * これが無いと、復元した側が「止まっているはずの相手を動かし続ける」か
   * 「動いているはずの相手を止める」かのどちらかになり、スナップショットから
   * その後の動きを再現できない。同期を後付けする前提が崩れる。
   */
  readonly moveInput: MovementInput;
  /**
   * このスナップショットを取った時刻。
   *
   * 各時刻 (`swing.startedAt` / `invulnerableUntil` / `dodgeReadyAt` /
   * `sleepAt` / `lastReviveAt`) は取った側の時計での絶対値で、
   * `performance.now()` の原点はページごとに違う。`restore()` がこの値を
   * 基準に差分を取り直す。
   */
  readonly takenAt: number;
}

/** 攻撃が当たったことを外へ知らせる。ボスへのダメージはここから入る。 */
export interface PlayerAttackHit {
  readonly attackerId: string;
  readonly damage: number;
  /** 判定の中心。攻撃が届く範囲は ATTACK_REACH。 */
  readonly origin: PlanarPosition;
}

export interface PlayerOptions {
  readonly id: string;
  readonly characterId: CharacterId;
  readonly clock: { now(): number };
  readonly position?: PlanarPosition;
  /** 攻撃判定が出たときに呼ばれる。ボスへ当てるのは呼び出し側の責務。 */
  readonly onAttackHit?: (hit: PlayerAttackHit) => void;
}

export interface Player {
  /** 入力を1つ受け取る。 */
  submit(action: GameAction): void;
  /** 時間を進める。攻撃判定・睡眠カウントダウンはここから起きる。 */
  update(deltaSeconds: number): void;
  /** ダメージを受ける。無敵中は通らない。 */
  takeDamage(amount: number): number;
  /**
   * 仲間を起こす入力。範囲内に居る倒れた仲間のゲージを進める。
   * 2人が同時に連打すれば倍の速さで進む (§5.3)。人数で分岐は書かない。
   */
  reviveNeighbor(target: Player): void;
  /**
   * 蘇生の連打を1回ぶん受け取る。必要回数に届いたら起き上がる。
   *
   * `reviveNeighbor` から呼ばれる。`restore` で書き戻す形にはしない。
   * あちらは「同期されたスナップショットを読み込む」ためのもので、
   * 読んでから書くまでの間に相手の状態が変わると取りこぼすため
   * (蘇生と同期が同じ入口を共有していると、tick をまたいだ瞬間に壊れる)。
   */
  receiveRevive(revivedAt: number): void;
  snapshot(): PlayerSnapshot;
  /** 同期されたスナップショットを読み込む。蘇生には使わない。 */
  restore(snapshot: PlayerSnapshot): void;
}

export function createPlayer(options: PlayerOptions): Player {
  const { id, characterId, clock, onAttackHit } = options;
  const stats = CHARACTER_STATS[characterId];

  let status: PlayerStatus = 'ACTIVE';
  let hp = stats.maxHp;
  const hpMax = stats.maxHp;
  let position: PlanarPosition = options.position ?? { x: 0, z: 0 };
  let rotationY = 0;
  let swing: ComboSwing | null = null;
  let invulnerableUntil: number | null = null;
  let dodgeReadyAt = 0;
  let sleepAt: number | null = null;
  let reviveInputs = 0;
  let lastReviveAt: number | null = null;
  let moveInput: MovementInput = { forward: 0, right: 0 };

  function isInvulnerable(): boolean {
    return invulnerableUntil !== null && clock.now() < invulnerableUntil;
  }

  /** 硬直中か。攻撃を振っている間は移動と回避を受け付けない。 */
  function isBusy(): boolean {
    if (swing === null) return false;
    const step = comboStepAt(swing.stepIndex);
    return comboPhaseAt(clock.now() - swing.startedAt, step) !== 'DONE';
  }

  function startAttack(intensity: number | undefined): void {
    const stepIndex = nextComboStep(swing, clock.now());
    if (stepIndex === null) return;
    swing = {
      stepIndex,
      startedAt: clock.now(),
      damageMultiplier: damageMultiplierForIntensity(intensity),
      hasHit: false,
    };
  }

  function startDodge(): void {
    const now = clock.now();
    if (now < dodgeReadyAt) return;

    // 移動方向へステップする。入力が無ければ向いている方向へ。
    const direction =
      moveInput.forward === 0 && moveInput.right === 0
        ? { forward: Math.cos(rotationY), right: -Math.sin(rotationY) }
        : moveInput;

    position = moveCharacter({
      position,
      input: direction,
      speed: stats.dodgeDistance,
      delta: 1,
      bounds: ARENA_BOUNDS,
    });
    // 回避中は判定を素通りする (§4.2「短時間の無敵時間」)。
    invulnerableUntil = now + stats.dodgeInvulnerableMs;
    dodgeReadyAt = now + stats.dodgeCooldownMs;
    // 回避で攻撃は中断される。
    swing = null;
  }

  return {
    submit(action) {
      // 倒れている間は自分では何もできない。仲間に起こしてもらう (§5.3)。
      if (status !== 'ACTIVE') return;

      if (action.type === 'MOVE') {
        moveInput = action.input;
        return;
      }
      if (action.type === 'ATTACK') {
        startAttack(action.intensity);
        return;
      }
      if (action.type === 'DODGE') {
        startDodge();
        return;
      }
      // INTERACT / REVIVE / CHARACTER_ACTION は、装置や仲間といった
      // 相手がある行動なので、相手を知っている呼び出し側が解決する
      // (src/game/session/boss-battle.ts)。ここで握り潰しているのではなく、
      // プレイヤー1人では決められないという理由で持たない。
    },

    update(deltaSeconds) {
      const now = clock.now();

      if (status === 'FALLING_ASLEEP') {
        if (sleepAt !== null && now >= sleepAt) {
          status = 'ASLEEP';
          sleepAt = null;
        }
        return;
      }
      if (status === 'ASLEEP') return;

      // 攻撃の判定。ロジック側の時刻で決める (technical-design §13)。
      if (swing !== null) {
        const step = comboStepAt(swing.stepIndex);

        // 判定が出ている尺をフレームがまたいだ場合も取りこぼさない。
        // 60fps なら activeMs (100ms) の中に必ずフレームが入るが、処理落ちや
        // バックグラウンドのタブでは WINDUP から RECOVER へ一気に飛ぶ。
        // そこで判定を捨てると、攻撃1回ぶんのダメージが黙って消える。
        const reachedActive = now - swing.startedAt >= step.windupMs;

        if (reachedActive && !swing.hasHit) {
          swing = { ...swing, hasHit: true };
          onAttackHit?.({
            attackerId: id,
            damage: stats.attackPower * step.damageScale * (swing.damageMultiplier ?? 1),
            origin: position,
          });
        }
        // 振り終わった swing はここで捨てない。次の入力が猶予
        // (COMBO_WINDOW_MS) 内かどうかを nextComboStep が前段から判断する。
      }

      // 攻撃を振っている間は動かない。
      if (isBusy()) return;

      if (moveInput.forward !== 0 || moveInput.right !== 0) {
        position = moveCharacter({
          position,
          input: moveInput,
          speed: stats.moveSpeed,
          delta: deltaSeconds,
          bounds: ARENA_BOUNDS,
        });
        rotationY = facingRotationY(moveInput) ?? rotationY;
      }
    },

    takeDamage(amount) {
      if (status !== 'ACTIVE') return hp;
      if (isInvulnerable()) return hp;

      hp = Math.min(hpMax, Math.max(0, hp - amount));
      if (hp === 0) {
        // 即退場ではなく、その場で布団を出して寝ようとする (§5.2)。
        status = 'FALLING_ASLEEP';
        sleepAt = clock.now() + DEFAULT_REVIVAL.sleepCountdownMs;
        reviveInputs = 0;
        lastReviveAt = null;
        swing = null;
      }
      return hp;
    },

    reviveNeighbor(target) {
      if (status !== 'ACTIVE') return;
      const snapshot = target.snapshot();
      // 完全に寝てしまった相手は、この仕組みでは起こせない (§5.5)。
      if (snapshot.status !== 'FALLING_ASLEEP') return;

      const distance = Math.hypot(
        snapshot.position.x - position.x,
        snapshot.position.z - position.z,
      );
      // 駆け寄る必要がある。遠くからは起こせない (§5.3)。
      if (distance > DEFAULT_REVIVAL.reviveRange) return;

      // 連打の間隔に下限を設ける。速く叩いても設定した時間より早くは
      // 起き上がらない。救助する側が自分の間隔を持つので、2人で起こせば
      // そのぶん素直に速くなる。
      const now = clock.now();
      if (lastReviveAt !== null && now - lastReviveAt < REVIVE_INPUT_INTERVAL_MS) return;
      lastReviveAt = now;

      target.receiveRevive(now);
    },

    receiveRevive(revivedAt) {
      if (status !== 'FALLING_ASLEEP') return;

      reviveInputs += 1;
      if (reviveInputs < requiredReviveInputs()) return;

      status = 'ACTIVE';
      hp = Math.round(hpMax * DEFAULT_REVIVAL.revivedHpRatio);
      sleepAt = null;
      reviveInputs = 0;
      lastReviveAt = null;
      // 起こされた直後に即座に倒れ直さないよう、短い無敵を付ける (§5.3)。
      invulnerableUntil = revivedAt + DEFAULT_REVIVAL.revivedInvulnerableMs;
    },

    snapshot() {
      return {
        id,
        characterId,
        status,
        hp,
        hpMax,
        position,
        rotationY,
        swing,
        invulnerableUntil,
        dodgeReadyAt,
        sleepAt,
        reviveInputs,
        lastReviveAt,
        moveInput,
        takenAt: clock.now(),
      };
    },

    restore(next) {
      status = next.status;
      hp = next.hp;
      position = next.position;
      rotationY = next.rotationY;
      reviveInputs = next.reviveInputs;
      moveInput = next.moveInput;

      // 送り主の時計と自分の時計の原点をそろえる (BossSnapshot と同じ理由)。
      const shift = clock.now() - next.takenAt;
      const rebase = (at: number): number => at + shift;

      swing =
        next.swing === null ? null : { ...next.swing, startedAt: rebase(next.swing.startedAt) };
      invulnerableUntil = next.invulnerableUntil === null ? null : rebase(next.invulnerableUntil);
      dodgeReadyAt = rebase(next.dodgeReadyAt);
      sleepAt = next.sleepAt === null ? null : rebase(next.sleepAt);
      lastReviveAt = next.lastReviveAt === null ? null : rebase(next.lastReviveAt);
    },
  };
}

/**
 * 1人で起こしきるのに必要な連打回数。
 * `soloReviveMs` を連打間隔で割った回数で、設定値を変えれば追随する。
 */
export function requiredReviveInputs(): number {
  return Math.ceil(DEFAULT_REVIVAL.soloReviveMs / REVIVE_INPUT_INTERVAL_MS);
}

/** 蘇生の進捗を 0〜1 の割合で読む。ゲージ表示用。 */
export function reviveRatio(snapshot: PlayerSnapshot): number {
  return Math.min(1, snapshot.reviveInputs / requiredReviveInputs());
}

/** 攻撃が相手へ届いているか。§4.1 の「ボス付近で軽い方向補正」もこの範囲。 */
export function isWithinAttackReach(hit: PlayerAttackHit, target: PlanarPosition): boolean {
  return Math.hypot(target.x - hit.origin.x, target.z - hit.origin.z) <= ATTACK_REACH;
}

/** 全員が寝たか。§5.5 の敗北条件。 */
export function isAllAsleep(players: readonly Player[]): boolean {
  return players.length > 0 && players.every((player) => player.snapshot().status === 'ASLEEP');
}
