import type { GameClock } from '../clock';
import type { CombatState } from '../types/combat-state';

/**
 * 滞在時間を持つ State とその時間 (ms)。
 * docs/single-player-poc-spec.md §15 の表に対応する。
 *
 * 現れない State とその理由:
 *
 * - `JUDGE` は「即時」。update() の中で入って抜けるため State を覗くだけでは
 *   観測できず、遷移を確認したい利用側は onTransition() を購読する。
 * - `IDLE` は次の攻撃を startAttack() で受けるまで続く。攻撃と攻撃の間隔は
 *   シーケンス側 (#10) の担当なので、この State Machine は長さを持たない。
 * - 終了状態 (BOSS_DEFEATED / PLAYER_LOSE) は抜けない。
 */
export interface CombatTimings {
  INTRO: number;
  TELEGRAPH: number;
  ATTACK: number;
  HIT: number;
  COUNTER_WINDOW: number;
  DAMAGE: number;
}

/**
 * docs/single-player-poc-spec.md §15 の既定値。
 * TELEGRAPH / ATTACK / COUNTER_WINDOW は仕様が幅を持つため中央付近を採る。
 */
export const DEFAULT_COMBAT_TIMINGS: CombatTimings = {
  INTRO: 3000,
  TELEGRAPH: 2000,
  ATTACK: 450,
  HIT: 1000,
  COUNTER_WINDOW: 2000,
  DAMAGE: 400,
};

/**
 * 1回の update() で連鎖させる State 数の上限。
 * JUDGE のような即時 State を挟むためループにしているので、
 * 実装のバグで無限に回らないよう上限を置く。
 */
const MAX_CHAINED_TRANSITIONS = 16;

/** 終了状態。ここへ入ったら通常の攻撃サイクルへ戻らない。 */
export type TerminalState = 'BOSS_DEFEATED' | 'PLAYER_LOSE';

const TERMINAL_STATES: ReadonlySet<CombatState> = new Set<CombatState>([
  'BOSS_DEFEATED',
  'PLAYER_LOSE',
]);

/**
 * 1回の攻撃について State Machine が知る必要のあることだけを持つ。
 *
 * 着弾タイミング・入力受付幅・Cue・Damage はここに現れない。
 * 攻撃パラメータは #4 の共通基盤、入力受付は #3 の担当で、
 * State Machine は「どの State に何ms留まるか」だけを見る
 * (docs/technical-design.md §7 の「技固有の処理を State Machine 本体へ
 * 大量に記述しない」)。
 */
export interface CombatAttack {
  id: string;
  /** この攻撃だけ State 滞在時間を変えたい場合の上書き。 */
  timings?: Partial<CombatTimings>;
}

/** State が切り替わったことの通知。JUDGE のような即時 State もここには必ず現れる。 */
export interface CombatTransition {
  from: CombatState;
  to: CombatState;
  /** 遷移した時刻 (ms)。GameClock から取る。 */
  at: number;
  /** 遷移先 State の論理上の開始時刻。時間超過をまとめて処理した場合は `at` より前になる。 */
  startedAt: number;
}

export type CombatTransitionListener = (transition: CombatTransition) => void;

/** JUDGE の結果として State Machine が区別する2つの行き先。 */
export type JudgementOutcome = 'SUCCESS' | 'FAILURE';

/**
 * JUDGE へ入ったときに、その攻撃が成功だったかを返す注入点。
 *
 * 入力の受付時間・早押し・連打ロックは #3、着弾タイミングと判定の接続は #4 の
 * 担当なので、State Machine は PlayerAction も受付ウィンドウも知らない。
 * ここが SUCCESS を返せば COUNTER_WINDOW、FAILURE なら HIT へ進む。
 *
 * 入力が無かった場合も FAILURE を返せばよい (docs/single-player-poc-spec.md §13
 * の「遅すぎる → 被弾」)。
 */
export type ResolveJudgement = (attack: CombatAttack) => JudgementOutcome;

/**
 * 戦闘終了の判定を State Machine の外へ出すための注入点。
 *
 * HP / SLEEPINESS は #5 の責務なのでこの State Machine は値を持たない。
 * HIT / DAMAGE を抜ける時点でこれを呼び、終了状態が返ればそこへ遷移する。
 */
export type ResolveBattleEnd = () => TerminalState | null;

export interface CombatStateMachineOptions {
  clock: GameClock;
  timings?: Partial<CombatTimings>;
  /** 既定では失敗扱い。判定を持つ側 (#3 / #4) が差し替える。 */
  resolveJudgement?: ResolveJudgement;
  /** 既定では終了しない (null)。HP / SLEEPINESS を持つ側 (#5) が差し替える。 */
  resolveBattleEnd?: ResolveBattleEnd;
}

export interface CombatStateMachine {
  readonly state: CombatState;
  /** 進行中の攻撃。攻撃サイクル外では null。 */
  readonly currentAttack: CombatAttack | null;
  /**
   * 現在の State を抜ける論理上の時刻 (ms)。時間で抜けない State では null。
   *
   * update() が呼ばれた回数によらず決まるので、フレーム落ちで update() が
   * 遅れても同じ値になる。着弾予定時刻のように、遷移が通知される前から
   * 逆算したい側がここを読む。
   */
  readonly stateDeadline: number | null;
  /** 時間経過を進める。時刻は GameClock から読む。 */
  update(): void;
  /** 攻撃を開始する。IDLE 以外では何もせず false を返す (多重開始防止)。 */
  startAttack(attack: CombatAttack): boolean;
  /**
   * 反撃が成立したことを伝え、COUNTER_WINDOW を閉じて DAMAGE へ進める。
   * COUNTER_WINDOW 以外では何もせず false を返す。
   *
   * 反撃可能時間外の入力を WHIFF として扱うのは #3 の担当なので、
   * ここでは「成立した反撃」だけを受ける。
   */
  registerCounter(): boolean;
  onTransition(listener: CombatTransitionListener): () => void;
}

/** 終了状態か。型を絞ることで、滞在時間を持たない State を取り違えないようにする。 */
function isTerminal(state: CombatState): state is TerminalState {
  return TERMINAL_STATES.has(state);
}

/**
 * 戦闘の State Machine。docs/technical-design.md §7 / docs/single-player-poc-spec.md §14。
 *
 * React / Three.js へ依存しない Pure TypeScript。時間は GameClock から読むため、
 * テストでは FakeClock を進めればよく実時間を待たない。
 *
 * 判定と勝敗は注入で外に出しているので、この関数が持つのは
 * State の同一性・滞在時間・遷移順序・終了状態の吸収・多重開始防止だけ。
 */
export function createCombatStateMachine(options: CombatStateMachineOptions): CombatStateMachine {
  const { clock, resolveJudgement = () => 'FAILURE', resolveBattleEnd = () => null } = options;
  const baseTimings: CombatTimings = { ...DEFAULT_COMBAT_TIMINGS, ...options.timings };

  const listeners = new Set<CombatTransitionListener>();

  let state: CombatState = 'INTRO';
  /** 現在の State へ入った時刻 (ms)。滞在時間の起点。 */
  let enteredAt = clock.now();
  /** 進行中の攻撃による上書きを含む滞在時間。 */
  let timings: CombatTimings = baseTimings;
  let attack: CombatAttack | null = null;
  /** 通知中に発生した遷移の順番待ち。入れ子の通知で順序が入れ替わらないようにする。 */
  const pending: CombatTransition[] = [];
  let notifying = false;

  /**
   * State を切り替える。
   *
   * `startedAt` には、滞在時間を満たして進む場合は「前の State の期限」を渡す。
   * clock.now() で始めると、フレーム落ちなどで update() が期限より遅れて
   * 呼ばれたぶん (overshoot) を毎回捨ててしまい、入力受付が仕様より延びる。
   * 入力や攻撃開始で切り替わる場合は現在時刻でよい。
   */
  function transitionTo(next: CombatState, startedAt: number = clock.now()): void {
    const from = state;
    const at = clock.now();

    state = next;
    enteredAt = startedAt;

    notify({ from, to: next, at, startedAt });
  }

  /**
   * 遷移を購読者へ通知する。
   *
   * 購読者が中で startAttack() などを呼ぶと通知が入れ子になり、後から登録した
   * 購読者が内側の遷移を先に受け取って State とずれる。通知中に発生した遷移は
   * 順番待ちにして、1件ずつ最後まで配り終えてから次を配る。
   */
  function notify(transition: CombatTransition): void {
    pending.push(transition);

    if (notifying) {
      return;
    }

    notifying = true;
    try {
      let next = pending.shift();

      while (next) {
        for (const listener of listeners) {
          listener(next);
        }

        next = pending.shift();
      }
    } finally {
      notifying = false;
      pending.length = 0;
    }
  }

  /** 現在の State の滞在時間。時間で抜けない State は null。 */
  function dwellOf(current: CombatState): number | null {
    if (current === 'JUDGE' || current === 'IDLE' || isTerminal(current)) {
      return null;
    }

    return timings[current];
  }

  /** 攻撃サイクルを閉じる。戦闘終了なら終了状態へ、そうでなければ IDLE へ戻る。 */
  function closeCycle(startedAt?: number): void {
    const ended = resolveBattleEnd();

    attack = null;
    timings = baseTimings;

    transitionTo(ended ?? 'IDLE', startedAt);
  }

  /**
   * JUDGE を評価して HIT か COUNTER_WINDOW へ即時に振り分ける。
   * JUDGE は滞在時間を持たないので、入ってきた期限をそのまま次へ渡す。
   */
  function judge(): void {
    const judgedAt = enteredAt;
    const current = attack;

    if (!current) {
      closeCycle(judgedAt);
      return;
    }

    const outcome = resolveJudgement(current);

    transitionTo(outcome === 'SUCCESS' ? 'COUNTER_WINDOW' : 'HIT', judgedAt);
  }

  /**
   * 滞在時間を満たした State を1つ進める。
   * まだ進めない場合は false を返し、update() のループを止める。
   */
  function advanceOnce(): boolean {
    if (state === 'JUDGE') {
      judge();
      return true;
    }

    const dwell = dwellOf(state);

    if (dwell === null || clock.now() - enteredAt < dwell) {
      return false;
    }

    // 期限どおりに進んだものとして次の State を始める。update() が遅れて
    // 呼ばれても、遅れたぶんが次の State の滞在時間から差し引かれる。
    const deadline = enteredAt + dwell;

    switch (state) {
      case 'INTRO': {
        transitionTo('IDLE', deadline);
        return true;
      }

      case 'TELEGRAPH': {
        transitionTo('ATTACK', deadline);
        return true;
      }

      case 'ATTACK': {
        transitionTo('JUDGE', deadline);
        return true;
      }

      case 'COUNTER_WINDOW': {
        // 反撃が成立しないまま Window が切れた場合は DAMAGE へ入れずに閉じる。
        // DAMAGE はボスへ反撃が入った State なので、ここを通すと
        // 攻撃しなかったプレイヤーへ反撃成功と同じ結果を与えてしまう
        // (FUTON-006「回避成功・攻撃なし」は 大ダウン発生なし / 次攻撃へ進行)。
        closeCycle(deadline);
        return true;
      }

      case 'HIT':
      case 'DAMAGE': {
        closeCycle(deadline);
        return true;
      }

      default: {
        return false;
      }
    }
  }

  return {
    get state() {
      return state;
    },

    get currentAttack() {
      return attack;
    },

    get stateDeadline() {
      const dwell = dwellOf(state);

      return dwell === null ? null : enteredAt + dwell;
    },

    update() {
      for (let step = 0; step < MAX_CHAINED_TRANSITIONS; step += 1) {
        if (isTerminal(state) || !advanceOnce()) {
          return;
        }
      }
    },

    startAttack(next) {
      // SM-005: IDLE 以外からは始めない。ATTACK 中の開始要求で2つ目が走らない。
      if (state !== 'IDLE') {
        return false;
      }

      attack = next;
      timings = { ...baseTimings, ...next.timings };

      transitionTo('TELEGRAPH');

      return true;
    },

    registerCounter() {
      if (state !== 'COUNTER_WINDOW') {
        return false;
      }

      transitionTo('DAMAGE');

      return true;
    },

    onTransition(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
