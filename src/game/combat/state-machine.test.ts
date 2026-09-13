import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import type { CombatState } from '../types/combat-state';
import {
  createCombatStateMachine,
  DEFAULT_COMBAT_TIMINGS,
  type CombatAttack,
  type CombatStateMachine,
  type CombatStateMachineOptions,
  type CombatTimings,
} from './state-machine';

/**
 * State Machine は攻撃の中身を見ないので、ダミーは id だけで足りる。
 * 着弾タイミングや受付幅を持たないことがこの State Machine の責務の線引き。
 */
const dummyAttack: CombatAttack = { id: 'dummy' };

/** FakeClock と遷移ログを繋いだ State Machine。JUDGE は即時なので遷移ログで観測する。 */
function setup(options: Omit<CombatStateMachineOptions, 'clock'> = {}) {
  const clock = createFakeClock();
  const machine = createCombatStateMachine({ clock, ...options });
  const visited: CombatState[] = [];

  machine.onTransition(({ to }) => visited.push(to));

  /** 指定時間だけ進め、その間の update() を回す。 */
  const advance = (ms: number) => {
    clock.advance(ms);
    machine.update();
  };

  return { clock, machine, visited, advance };
}

/** 常に成功と判定する State Machine。回避成功のサイクルを見るため。 */
function setupSucceeding(options: Omit<CombatStateMachineOptions, 'clock'> = {}) {
  return setup({ resolveJudgement: () => 'SUCCESS', ...options });
}

/** INTRO を消化して IDLE まで進める。攻撃を開始できる状態。 */
function toIdle(
  machine: CombatStateMachine,
  advance: (ms: number) => void,
  timings: CombatTimings = DEFAULT_COMBAT_TIMINGS,
) {
  advance(timings.INTRO);
  expect(machine.state).toBe('IDLE');
}

describe('createCombatStateMachine', () => {
  it('INTROから始まりINTROの時間経過でIDLEへ移る', () => {
    const { machine, advance } = setup();

    advance(DEFAULT_COMBAT_TIMINGS.INTRO);

    expect(machine.state).toBe('IDLE');
  });

  it('INTROの滞在時間に達するまではIDLEへ移らない', () => {
    const { machine, advance } = setup();

    advance(DEFAULT_COMBAT_TIMINGS.INTRO - 1);

    expect(machine.state).toBe('INTRO');
  });

  it('IDLEは時間が経っても攻撃開始を待ち続ける', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);

    advance(DEFAULT_COMBAT_TIMINGS.INTRO * 10);

    expect(machine.state).toBe('IDLE');
  });

  // SM-001: 判定成功から反撃までの1サイクル。
  // JUDGE は滞在時間を持たず update() の中で抜けるため、state を覗くのではなく
  // 遷移ログで順序を検証する。state の sampling では JUDGE が落ちる。
  it('判定成功と反撃で IDLE→TELEGRAPH→ATTACK→JUDGE→COUNTER_WINDOW→DAMAGE→IDLE を一周する', () => {
    const { machine, visited, advance } = setupSucceeding();
    toIdle(machine, advance);
    visited.length = 0;

    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    machine.registerCounter();
    advance(DEFAULT_COMBAT_TIMINGS.DAMAGE);

    expect(visited).toEqual(['TELEGRAPH', 'ATTACK', 'JUDGE', 'COUNTER_WINDOW', 'DAMAGE', 'IDLE']);
  });

  // 大ダウンを持つ技は DAMAGE のあとに BOSS_DOWN を挟む。
  // 究極奥義・ふかふか布団の「約2.5〜3秒反撃可能」(§11)。
  it('BOSS_DOWN を持つ攻撃は DAMAGE のあとに大ダウンを挟む', () => {
    const { machine, visited, advance } = setupSucceeding();
    toIdle(machine, advance);
    visited.length = 0;

    machine.startAttack({ ...dummyAttack, timings: { BOSS_DOWN: 2800 } });
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    machine.registerCounter();
    advance(DEFAULT_COMBAT_TIMINGS.DAMAGE);

    expect(machine.state).toBe('BOSS_DOWN');

    advance(2799);
    expect(machine.state).toBe('BOSS_DOWN');

    advance(1);
    expect(visited).toEqual([
      'TELEGRAPH',
      'ATTACK',
      'JUDGE',
      'COUNTER_WINDOW',
      'DAMAGE',
      'BOSS_DOWN',
      'IDLE',
    ]);
  });

  // SM-002: 失敗判定は反撃へ行かず被弾して IDLE へ戻る。
  it('判定失敗で ATTACK→JUDGE→HIT→IDLE へ遷移する', () => {
    const { machine, visited, advance } = setup({ resolveJudgement: () => 'FAILURE' });
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    visited.length = 0;

    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    advance(DEFAULT_COMBAT_TIMINGS.HIT);

    expect(visited).toEqual(['JUDGE', 'HIT', 'IDLE']);
  });

  it('判定は進行中の攻撃を受け取る', () => {
    const seen: CombatAttack[] = [];
    const { machine, advance } = setup({
      resolveJudgement: (attack) => {
        seen.push(attack);
        return 'FAILURE';
      },
    });
    toIdle(machine, advance);

    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);

    expect(seen).toEqual([dummyAttack]);
  });

  it('判定を差し替えなければ失敗として扱う', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);

    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);

    expect(machine.state).toBe('HIT');
  });

  // SM-003 / SM-004: 終了判定は注入した resolveBattleEnd が決める。
  // HP / SLEEPINESS は #5 の責務なので、この State Machine は値を持たない。
  it.each([
    { ended: 'BOSS_DEFEATED' as const, label: 'ボス撃破' },
    { ended: 'PLAYER_LOSE' as const, label: 'プレイヤー敗北' },
  ])('サイクル終了時に $label と判定されたら $ended へ遷移する', ({ ended }) => {
    const { machine, advance } = setup({ resolveBattleEnd: () => ended });
    toIdle(machine, advance);

    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    advance(DEFAULT_COMBAT_TIMINGS.HIT);

    expect(machine.state).toBe(ended);
  });

  it.each([{ ended: 'BOSS_DEFEATED' as const }, { ended: 'PLAYER_LOSE' as const }])(
    '$ended へ入った後は時間が経っても攻撃Stateへ戻らない',
    ({ ended }) => {
      const { machine, advance } = setup({ resolveBattleEnd: () => ended });
      toIdle(machine, advance);

      machine.startAttack(dummyAttack);
      advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
      advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
      advance(DEFAULT_COMBAT_TIMINGS.HIT);
      const started = machine.startAttack(dummyAttack);
      advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH * 10);

      expect(machine.state).toBe(ended);
      expect(started).toBe(false);
    },
  );

  it('勝利で終わったサイクルの反撃成立要求は受け付けない', () => {
    const { machine, advance } = setup({ resolveBattleEnd: () => 'BOSS_DEFEATED' });
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    advance(DEFAULT_COMBAT_TIMINGS.HIT);

    const registered = machine.registerCounter();

    expect(registered).toBe(false);
    expect(machine.state).toBe('BOSS_DEFEATED');
  });

  // SM-005: 攻撃中の開始要求で2つ目の攻撃が走らない。
  it('ATTACK中に攻撃開始を要求しても受け付けずStateも変わらない', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);

    const started = machine.startAttack({ id: 'second' });

    expect(started).toBe(false);
    expect(machine.state).toBe('ATTACK');
  });

  it('多重開始を拒否しても進行中の攻撃は入れ替わらない', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);

    machine.startAttack({ id: 'second' });

    expect(machine.currentAttack).toEqual(dummyAttack);
  });

  it('IDLEからの攻撃開始は受け付ける', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);

    const started = machine.startAttack(dummyAttack);

    expect(started).toBe(true);
    expect(machine.state).toBe('TELEGRAPH');
  });

  it('サイクルが終わると進行中の攻撃は無くなる', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);

    advance(DEFAULT_COMBAT_TIMINGS.HIT);

    expect(machine.currentAttack).toBeNull();
  });

  // DAMAGE はボスへ反撃が入った State なので、攻撃しなかったプレイヤーが
  // 通ってはいけない。FUTON-006「回避成功・攻撃なし」は
  // 大ダウン発生なし / 次攻撃へ進行。
  it('反撃が成立しないままCOUNTER_WINDOWが切れたらDAMAGEを通らずIDLEへ戻る', () => {
    const { machine, visited, advance } = setupSucceeding();
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    visited.length = 0;

    advance(DEFAULT_COMBAT_TIMINGS.COUNTER_WINDOW);

    expect(visited).toEqual(['IDLE']);
  });

  it.each([
    { state: 'INTRO' as const },
    { state: 'IDLE' as const },
    { state: 'TELEGRAPH' as const },
  ])('COUNTER_WINDOW ではない $state での反撃成立要求は受け付けない', ({ state }) => {
    const { machine, advance } = setupSucceeding();

    if (state !== 'INTRO') {
      toIdle(machine, advance);
    }
    if (state === 'TELEGRAPH') {
      machine.startAttack(dummyAttack);
    }

    const registered = machine.registerCounter();

    expect(registered).toBe(false);
    expect(machine.state).toBe(state);
  });

  it('反撃成立後の2回目の要求は受け付けない', () => {
    const { machine, advance } = setupSucceeding();
    toIdle(machine, advance);
    machine.startAttack(dummyAttack);
    advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);

    const first = machine.registerCounter();
    const second = machine.registerCounter();

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  // 完了条件「各Stateの滞在時間を設定から変更できる」。
  // 時間で抜ける State をすべて短縮し、設定値どおりに進むことを見る。
  describe('滞在時間を設定から変更できる', () => {
    const fastTimings: CombatTimings = {
      INTRO: 10,
      TELEGRAPH: 20,
      ATTACK: 30,
      HIT: 40,
      COUNTER_WINDOW: 50,
      DAMAGE: 60,
      // 大ダウンを持たない技の既定。0 のあいだは BOSS_DOWN を経由しない。
      BOSS_DOWN: 0,
    };

    // 各 State の頭までの進め方。State ごとに経路が違うので表に関数で持たせる。
    // JUDGE は滞在時間を持たず同じ update() 内で抜けるため、到達先は
    // state ではなく遷移ログで見る。ATTACK の行が JUDGE で止まらないのはそのため。
    it.each([
      {
        from: 'INTRO' as const,
        to: 'IDLE' as const,
        dwell: fastTimings.INTRO,
        arrive: () => {},
      },
      {
        from: 'TELEGRAPH' as const,
        to: 'ATTACK' as const,
        dwell: fastTimings.TELEGRAPH,
        arrive: (m: CombatStateMachine, advance: (ms: number) => void) => {
          toIdle(m, advance, fastTimings);
          m.startAttack(dummyAttack);
        },
      },
      {
        from: 'ATTACK' as const,
        to: 'JUDGE' as const,
        dwell: fastTimings.ATTACK,
        arrive: (m: CombatStateMachine, advance: (ms: number) => void) => {
          toIdle(m, advance, fastTimings);
          m.startAttack(dummyAttack);
          advance(fastTimings.TELEGRAPH);
        },
      },
      {
        // 反撃が成立しなかった場合は DAMAGE を通らず IDLE へ戻る。
        from: 'COUNTER_WINDOW' as const,
        to: 'IDLE' as const,
        dwell: fastTimings.COUNTER_WINDOW,
        arrive: (m: CombatStateMachine, advance: (ms: number) => void) => {
          toIdle(m, advance, fastTimings);
          m.startAttack(dummyAttack);
          advance(fastTimings.TELEGRAPH);
          advance(fastTimings.ATTACK);
        },
      },
      {
        from: 'DAMAGE' as const,
        to: 'IDLE' as const,
        dwell: fastTimings.DAMAGE,
        arrive: (m: CombatStateMachine, advance: (ms: number) => void) => {
          toIdle(m, advance, fastTimings);
          m.startAttack(dummyAttack);
          advance(fastTimings.TELEGRAPH);
          advance(fastTimings.ATTACK);
          m.registerCounter();
        },
      },
    ])(
      '$from は設定した $dwell ms で $to へ移り、その1ms前では移らない',
      ({ from, to, dwell, arrive }) => {
        const { machine, visited, advance } = setupSucceeding({ timings: fastTimings });
        arrive(machine, advance);

        advance(dwell - 1);
        const before = machine.state;
        visited.length = 0;
        advance(1);

        expect(before).toBe(from);
        expect(visited[0]).toBe(to);
      },
    );

    it('HIT も設定した滞在時間でIDLEへ戻る', () => {
      const { machine, advance } = setup({ timings: fastTimings });
      toIdle(machine, advance, fastTimings);
      machine.startAttack(dummyAttack);
      advance(fastTimings.TELEGRAPH);
      advance(fastTimings.ATTACK);
      expect(machine.state).toBe('HIT');

      advance(fastTimings.HIT - 1);
      const before = machine.state;
      advance(1);

      expect(before).toBe('HIT');
      expect(machine.state).toBe('IDLE');
    });
  });

  it('攻撃ごとの滞在時間の上書きが既定値より優先される', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);

    machine.startAttack({ ...dummyAttack, timings: { TELEGRAPH: 50 } });
    advance(50);

    expect(machine.state).toBe('ATTACK');
  });

  it('攻撃が終わると滞在時間の上書きは次の攻撃へ持ち越さない', () => {
    const { machine, advance } = setup();
    toIdle(machine, advance);
    machine.startAttack({ ...dummyAttack, timings: { TELEGRAPH: 50 } });
    advance(50);
    advance(DEFAULT_COMBAT_TIMINGS.ATTACK);
    advance(DEFAULT_COMBAT_TIMINGS.HIT);

    machine.startAttack(dummyAttack);
    advance(50);

    expect(machine.state).toBe('TELEGRAPH');
  });

  // フレーム落ちなどで update() が期限より遅れて呼ばれた場合。
  // 遅れたぶんを捨てると入力受付が仕様より延びてしまう。
  describe('update() が期限より遅れて呼ばれたとき', () => {
    it('1回のupdateで滞在時間を満たしたStateを続けて抜ける', () => {
      const { machine, clock } = setup();
      clock.advance(DEFAULT_COMBAT_TIMINGS.INTRO);
      machine.update();
      machine.startAttack(dummyAttack);

      // TELEGRAPH 2000 + ATTACK 450 がまとめて経過した1回のジャンプ。
      clock.advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH + DEFAULT_COMBAT_TIMINGS.ATTACK + 50);
      machine.update();

      expect(machine.state).toBe('HIT');
    });

    it('遅れたぶんは次のStateの滞在時間から差し引かれる', () => {
      const { machine, clock } = setup();
      clock.advance(DEFAULT_COMBAT_TIMINGS.INTRO);
      machine.update();
      machine.startAttack(dummyAttack);

      // TELEGRAPH の期限を 100ms 超えてから update する。
      clock.advance(DEFAULT_COMBAT_TIMINGS.TELEGRAPH + 100);
      machine.update();
      expect(machine.state).toBe('ATTACK');
      // ATTACK は残り 450-100=350ms のはずなので、349ms では抜けない。
      clock.advance(DEFAULT_COMBAT_TIMINGS.ATTACK - 100 - 1);
      machine.update();
      const before = machine.state;
      clock.advance(1);
      machine.update();

      expect(before).toBe('ATTACK');
      expect(machine.state).toBe('HIT');
    });
  });

  // 購読者が中で startAttack() を呼ぶと通知が入れ子になる。後から登録した
  // 購読者が内側の遷移を先に受け取ると、State とずれたまま処理してしまう。
  it('購読中に別の遷移が起きても購読者は発生順に受け取る', () => {
    const clock = createFakeClock();
    const machine = createCombatStateMachine({ clock });
    // IDLE へ入ったら即座に次の攻撃を始める購読者。シーケンス側の想定。
    machine.onTransition(({ to }) => {
      if (to === 'IDLE') {
        machine.startAttack(dummyAttack);
      }
    });
    const seen: CombatState[] = [];
    machine.onTransition(({ to }) => seen.push(to));

    clock.advance(DEFAULT_COMBAT_TIMINGS.INTRO);
    machine.update();

    expect(seen).toEqual(['IDLE', 'TELEGRAPH']);
  });

  it('購読を解除した後は遷移が通知されない', () => {
    const { machine, advance } = setup();
    const seen: CombatState[] = [];
    const unsubscribe = machine.onTransition(({ to }) => seen.push(to));

    unsubscribe();
    advance(DEFAULT_COMBAT_TIMINGS.INTRO);

    expect(seen).toEqual([]);
  });
});
