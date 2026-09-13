import { beforeEach, describe, expect, it } from 'vitest';

import { createSilentAudioOutput } from '@/audio/audio-output';
import { createFakeClock } from '@/game/clock';
import type { GameEvent } from '@/game/events/game-event';
import type { PlayerAction } from '@/game/types';
import {
  BOSS_DOWN_FOLLOW_UP_DAMAGE,
  DEFAULT_ATTACK_DAMAGE,
  INITIAL_BOSS_HP,
  MAX_SLEEPINESS,
} from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { createAttackSequence, DEFAULT_TUTORIAL_SEQUENCE } from '@/game/sequence/attack-sequence';

import { createCombatSession, type FrameLoop } from './combat-session';

/**
 * フレームを手で進められるループ。rAF も実時間も使わずに
 * 「何フレーム進んだか」だけを操作する。
 */
function createManualLoop(): { loop: FrameLoop; tick: () => void; isStopped: () => boolean } {
  let onFrame: (() => void) | null = null;
  let stopped = false;

  return {
    loop: (frame) => {
      onFrame = frame;
      return () => {
        stopped = true;
        onFrame = null;
      };
    },
    tick: () => onFrame?.(),
    isStopped: () => stopped,
  };
}

function setup() {
  const clock = createFakeClock();
  const { loop, tick, isStopped } = createManualLoop();
  // 音は鳴らさない。このテストが確かめるのは HUD と戦闘の接続で、
  // jsdom には再生できる音源が無い。
  const session = createCombatSession({
    clock,
    frameLoop: loop,
    random: () => 0,
    audioOutput: createSilentAudioOutput(),
  });

  const events: GameEvent[] = [];
  session.eventBus.subscribe((event) => events.push(event));

  const advance = (ms: number) => {
    clock.advance(ms);
    tick();
  };

  return { advance, clock, events, isStopped, session, tick };
}

describe('createCombatSession', () => {
  beforeEach(() => {
    useGameStore.setState({
      combatState: 'INTRO',
      bossHp: INITIAL_BOSS_HP,
      bossHpMax: INITIAL_BOSS_HP,
      sleepiness: 0,
      sleepinessMax: MAX_SLEEPINESS,
      lastAttackId: null,
      sequencePhase: 'TUTORIAL',
      assistVisible: false,
      eventFeedback: null,
    });
  });

  it('戦闘を進めるとHUDの表示状態が実際の戦闘イベントで変わる', () => {
    const { advance, tick } = setup();

    // INTRO (既定3秒) を抜けて最初の技が始まるまで進める。
    tick();
    advance(3_100);

    expect(useGameStore.getState().combatState).not.toBe('INTRO');

    // 防御入力を出さずに回すと被弾し、眠気が上がる。
    const feedbackSeen: unknown[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      advance(200);
      const { eventFeedback } = useGameStore.getState();
      if (eventFeedback !== null) feedbackSeen.push(eventFeedback);
    }

    expect(useGameStore.getState().sleepiness).toBeGreaterThan(0);
    // 入力が無いまま着弾した周回でも、被弾が表示イベントとして出る。
    expect(feedbackSeen).toContainEqual({
      kind: 'RESULT',
      result: 'HIT',
      attackId: 'PILLOW_SWEEP',
    });
  });

  it('戦闘の上限値をHUDのゲージの分母へ渡す', () => {
    setup();

    expect(useGameStore.getState()).toMatchObject({
      bossHpMax: INITIAL_BOSS_HP,
      sleepinessMax: MAX_SLEEPINESS,
    });
  });

  it('破棄するとループを止め、以降のイベントをHUDへ流さない', () => {
    const { advance, isStopped, session, tick } = setup();

    tick();
    advance(3_100);
    session.dispose();

    const stateAfterDispose = useGameStore.getState().combatState;
    session.eventBus.emit({ type: 'BOSS_HP_CHANGED', hp: 1 });

    expect(isStopped()).toBe(true);
    expect(useGameStore.getState().bossHp).not.toBe(1);
    expect(useGameStore.getState().combatState).toBe(stateAfterDispose);
  });

  it('チュートリアルの1手目から補助表示を出し、本戦では出さない', () => {
    // SEQ-003 / SEQ-004。1手だけのチュートリアルと本戦で切り替わりを見る。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      tutorialSequence: [{ slot: 'PILLOW_SWEEP', assist: true }],
      mainSequence: [{ slot: 'YAWN_WAVE', assist: false }],
    });

    const advance = (ms: number) => {
      clock.advance(ms);
      tick();
    };

    tick();
    advance(3_100);
    // 攻撃と攻撃の間隔 (既定1秒) を満たして1手目が始まる。
    advance(1_000);

    expect(useGameStore.getState()).toMatchObject({
      sequencePhase: 'TUTORIAL',
      assistVisible: true,
    });

    // 入力せず被弾して1サイクルを終え、本戦の手へ進める。
    for (let frame = 0; frame < 40; frame += 1) {
      advance(200);
      if (useGameStore.getState().sequencePhase === 'MAIN') break;
    }

    expect(useGameStore.getState()).toMatchObject({ sequencePhase: 'MAIN', assistVisible: false });
  });

  it('本戦の攻撃順を設定から差し替えられる', () => {
    // 完了条件「本戦の攻撃順を設定から調整できる」。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      tutorialSequence: [],
      mainSequence: [{ slot: 'FLUFFY_FUTON', assist: false }],
    });

    const started: string[] = [];
    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_STARTED') started.push(event.attackId);
    });

    tick();
    // INTRO (3秒) を抜けたあと、攻撃と攻撃の間隔 (既定1秒) を満たすまで進める。
    clock.advance(3_100);
    tick();
    clock.advance(1_000);
    tick();

    expect(started).toEqual(['FLUFFY_FUTON']);
  });

  it('正しく応じ続けると最終ふかふか布団のカウンターで決着する', () => {
    // 完了条件「最終ふかふか布団まで1戦を通して進行できる」。
    // チュートリアルの反撃でボスHPが削れると、全成功したプレイヤーほど
    // 早くボスが落ちて最終布団へ到達できない (仕様 §17)。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({ clock, frameLoop: loop, random: () => 0 });

    const steps: { index: number; phase: string; attackId: string }[] = [];
    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'SEQUENCE_STEP_STARTED') {
        steps.push({ index: event.stepIndex, phase: event.phase, attackId: event.attackId });
      }

      // 正解は Cue から読む。方向は Cue ID に埋まっている。
      if (event.type === 'ATTACK_VISUAL_CUE') {
        if (event.cue.includes('left')) pendingDefense = 'DODGE_RIGHT';
        else if (event.cue.includes('right')) pendingDefense = 'DODGE_LEFT';
        else pendingDefense = 'GUARD';
      }

      if (event.type === 'JUDGED') {
        shouldCounter = event.result === 'PERFECT_DODGE' || event.result === 'JUST_GUARD';
      }
    });

    tick();

    for (let frame = 0; frame < 4_000; frame += 1) {
      clock.advance(50);
      tick();

      const { combatState } = useGameStore.getState();

      // 着弾直前の受付内に防御を出す。
      if (combatState === 'ATTACK' && pendingDefense !== null) {
        session.submitAction(pendingDefense);
        pendingDefense = null;
      }

      // 1つの反撃機会につき1回だけ入力する。大ダウン中に連打すると
      // 追撃ぶんだけ余計にHPが削れ、「全成功」の定義が曖昧になる。
      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
      }

      if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') break;
    }

    // チュートリアル5手 + 本戦7手をすべて通る。
    expect(steps.map((step) => `${step.phase}:${step.attackId}`)).toEqual([
      'TUTORIAL:PILLOW_SWEEP',
      'TUTORIAL:PILLOW_SWEEP',
      'TUTORIAL:YAWN_WAVE',
      'TUTORIAL:YAWN_WAVE',
      'TUTORIAL:FLUFFY_FUTON',
      'MAIN:PILLOW_SWEEP',
      'MAIN:YAWN_WAVE',
      'MAIN:PILLOW_SWEEP',
      'MAIN:YAWN_WAVE',
      'MAIN:FLUFFY_FUTON',
      'MAIN:PILLOW_SWEEP',
      'MAIN:FLUFFY_FUTON',
    ]);
    // 決着は最終手。チュートリアルの布団で満たされない形で確かめる。
    expect(steps.at(-1)).toEqual({ index: 11, phase: 'MAIN', attackId: 'FLUFFY_FUTON' });
    expect(useGameStore.getState().combatState).toBe('BOSS_DEFEATED');
  });

  it('チュートリアルの反撃ではボスHPを削らない', () => {
    // 仕様 §17 はダメージ量を本戦の行にだけ書いている。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      mainSequence: [{ slot: 'PILLOW_SWEEP', assist: false }],
    });

    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_VISUAL_CUE') {
        pendingDefense = event.cue.includes('left') ? 'DODGE_RIGHT' : 'DODGE_LEFT';
      }
      if (event.type === 'JUDGED') shouldCounter = event.result === 'PERFECT_DODGE';
    });

    tick();

    // チュートリアル1手目だけを成功させる。
    for (let frame = 0; frame < 200; frame += 1) {
      clock.advance(50);
      tick();

      const { combatState } = useGameStore.getState();
      if (combatState === 'ATTACK' && pendingDefense !== null) {
        session.submitAction(pendingDefense);
        pendingDefense = null;
      }
      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
        // 反撃が DAMAGE へ入るまで進めてから抜ける。
        for (let settle = 0; settle < 20; settle += 1) {
          clock.advance(50);
          tick();
        }
        break;
      }
    }

    expect(useGameStore.getState().bossHp).toBe(INITIAL_BOSS_HP);
  });

  it('チュートリアルの補助付きの手では被弾ペナルティを軽くする', () => {
    // 仕様 §16「初回失敗時のペナルティは軽くする」。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    createCombatSession({ clock, frameLoop: loop, random: () => 0 });

    const advance = (ms: number) => {
      clock.advance(ms);
      tick();
    };

    tick();
    advance(3_100);

    // 何も入力せず1手目を被弾する。
    for (let frame = 0; frame < 40; frame += 1) {
      advance(200);
      if (useGameStore.getState().sleepiness > 0) break;
    }

    // 枕の既定は12。補助付きのチュートリアル1手目は半減する。
    expect(useGameStore.getState().sleepiness).toBe(
      DEFAULT_ATTACK_DAMAGE.PILLOW_SWEEP.sleepinessDamage / 2,
    );
  });

  it('戦闘を作り直すと前の戦闘の補助表示が残らない', () => {
    // store はセッションより長く生きるので、前の戦闘の進行状態が
    // 次の INTRO へ持ち越されないことを見る。
    useGameStore.setState({ sequencePhase: 'MAIN', assistVisible: true });

    createCombatSession({
      clock: createFakeClock(),
      frameLoop: createManualLoop().loop,
      random: () => 0,
    });

    expect(useGameStore.getState()).toMatchObject({
      sequencePhase: 'TUTORIAL',
      assistVisible: false,
    });
  });

  it('使いかけのシーケンスを渡して作り直しても先頭から出し直す', () => {
    // RESULT-008 の「Attack Sequence位置」。外から渡したシーケンスは
    // 前の戦闘で進んでいることがある。
    const sequence = createAttackSequence({ random: () => 0 });
    sequence.next();
    sequence.next();

    createCombatSession({
      clock: createFakeClock(),
      frameLoop: createManualLoop().loop,
      random: () => 0,
      sequence,
    });

    expect(sequence.index).toBe(0);
    expect(sequence.phase).toBe('TUTORIAL');
  });

  // ランダム枠 (§17 の 52〜60秒) はどちらを引いても最終布団まで行けること。
  // 枕(10)とあくび(15)でダメージが違うので、片方だけ通しても保証にならない。
  it.each([
    { branch: '枕', random: 0 },
    { branch: 'あくび', random: 0.9 },
  ])(
    '大ダウン中に追撃し続けても最終ふかふか布団まで到達する (ランダム枠=$branch)',
    ({ random: randomValue }) => {
      // 仕様 §11 の大ダウンは「最大の反撃チャンス」。そこで殴ったプレイヤーだけが
      // 本戦1つ目の布団で決着してしまい、ランダム枠と最終布団へ行けなくなっていた。
      const clock = createFakeClock();
      const { loop, tick } = createManualLoop();
      const session = createCombatSession({
        clock,
        frameLoop: loop,
        random: () => randomValue,
      });

      const steps: string[] = [];
      let pendingDefense: PlayerAction | null = null;
      let shouldCounter = false;

      session.eventBus.subscribe((event) => {
        if (event.type === 'SEQUENCE_STEP_STARTED')
          steps.push(`${event.stepIndex}:${event.attackId}`);
        if (event.type === 'ATTACK_VISUAL_CUE') {
          if (event.cue.includes('left')) pendingDefense = 'DODGE_RIGHT';
          else if (event.cue.includes('right')) pendingDefense = 'DODGE_LEFT';
          else pendingDefense = 'GUARD';
        }
        if (event.type === 'JUDGED') {
          shouldCounter = event.result === 'PERFECT_DODGE' || event.result === 'JUST_GUARD';
        }
      });

      tick();

      for (let frame = 0; frame < 8_000; frame += 1) {
        clock.advance(50);
        tick();

        const { combatState } = useGameStore.getState();

        if (combatState === 'ATTACK' && pendingDefense !== null) {
          session.submitAction(pendingDefense);
          pendingDefense = null;
        }
        if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
          session.submitAction('ATTACK');
          shouldCounter = false;
        }
        // 大ダウン中は押せるだけ押す。
        if (combatState === 'BOSS_DOWN') session.submitAction('ATTACK');

        if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') break;
      }

      expect(steps.at(-1)).toBe('11:FLUFFY_FUTON');
      expect(useGameStore.getState().combatState).toBe('BOSS_DEFEATED');
    },
  );

  it('大ダウン中の追撃でボスHPが減る', () => {
    // BOSS_DOWN_FOLLOW_UP_DAMAGE の単価の根拠。大ダウン中に入る発数が
    // 分かっていないと「合計が5未満」から単価を決められない。
    // 入力ロックがあるので押しっぱなしでも発数には上限がある。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({ clock, frameLoop: loop, random: () => 0 });

    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;
    let followUps = 0;
    let maxFollowUpsInOneDown = 0;
    let wasDown = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_VISUAL_CUE') {
        if (event.cue.includes('left')) pendingDefense = 'DODGE_RIGHT';
        else if (event.cue.includes('right')) pendingDefense = 'DODGE_LEFT';
        else pendingDefense = 'GUARD';
      }
      if (event.type === 'JUDGED') {
        shouldCounter = event.result === 'PERFECT_DODGE' || event.result === 'JUST_GUARD';
      }
      if (event.type === 'BOSS_HP_CHANGED' && wasDown) followUps += 1;
    });

    tick();

    for (let frame = 0; frame < 8_000; frame += 1) {
      clock.advance(50);
      tick();

      const { combatState } = useGameStore.getState();
      const isDown = combatState === 'BOSS_DOWN';

      if (wasDown && !isDown) {
        maxFollowUpsInOneDown = Math.max(maxFollowUpsInOneDown, followUps);
        followUps = 0;
      }
      wasDown = isDown;

      if (combatState === 'ATTACK' && pendingDefense !== null) {
        session.submitAction(pendingDefense);
        pendingDefense = null;
      }
      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
      }
      if (isDown) session.submitAction('ATTACK');

      if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') break;
    }

    // 追撃がゲームプレイ上の効果を持つこと (仕様 §11 の「最大の反撃チャンス」)。
    expect(BOSS_DOWN_FOLLOW_UP_DAMAGE).toBeGreaterThan(0);
    expect(maxFollowUpsInOneDown).toBeGreaterThan(0);
  });

  it('チュートリアル順を素の定義で書き直しても早期撃破しない', () => {
    // 倍率を既定配列にだけ書いていると、仕様どおりの5手を手で書き直した
    // だけでボスHPが80削れて本戦2手目で決着していた。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      // 倍率を書かない、素の { slot, assist } だけの指定。
      tutorialSequence: DEFAULT_TUTORIAL_SEQUENCE.map(({ slot, assist }) => ({ slot, assist })),
    });

    const steps: string[] = [];
    let pendingDefense: PlayerAction | null = null;
    let shouldCounter = false;

    session.eventBus.subscribe((event) => {
      if (event.type === 'SEQUENCE_STEP_STARTED')
        steps.push(`${event.stepIndex}:${event.attackId}`);
      if (event.type === 'ATTACK_VISUAL_CUE') {
        if (event.cue.includes('left')) pendingDefense = 'DODGE_RIGHT';
        else if (event.cue.includes('right')) pendingDefense = 'DODGE_LEFT';
        else pendingDefense = 'GUARD';
      }
      if (event.type === 'JUDGED') {
        shouldCounter = event.result === 'PERFECT_DODGE' || event.result === 'JUST_GUARD';
      }
    });

    tick();

    for (let frame = 0; frame < 8_000; frame += 1) {
      clock.advance(50);
      tick();

      const { combatState } = useGameStore.getState();

      if (combatState === 'ATTACK' && pendingDefense !== null) {
        session.submitAction(pendingDefense);
        pendingDefense = null;
      }
      if (combatState === 'COUNTER_WINDOW' && shouldCounter) {
        session.submitAction('ATTACK');
        shouldCounter = false;
      }

      if (combatState === 'BOSS_DEFEATED' || combatState === 'PLAYER_LOSE') break;
    }

    expect(steps.at(-1)).toBe('11:FLUFFY_FUTON');
  });

  it('手が終わったら次の手までのあいだに補助表示を畳む', () => {
    // 補助表示は「いま答えを見せている手」のもの。次の SEQUENCE_STEP_STARTED を
    // 待つと、チュートリアル最後の布団の答えが間隔のあいだ出たままになる。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      tutorialSequence: [{ slot: 'FLUFFY_FUTON', assist: true }],
      mainSequence: [{ slot: 'YAWN_WAVE', assist: false }],
    });

    const advance = (ms: number) => {
      clock.advance(ms);
      tick();
    };

    tick();
    advance(3_100);
    advance(1_000);

    expect(useGameStore.getState().assistVisible).toBe(true);

    // 入力せず被弾して1手目を終え、IDLE へ戻った時点を見る。
    // 次の手が始まる前 (間隔のあいだ) に畳まれていること。
    let clearedBeforeNextStep = false;
    for (let frame = 0; frame < 40; frame += 1) {
      advance(100);
      if (useGameStore.getState().sequencePhase === 'MAIN') {
        clearedBeforeNextStep = !useGameStore.getState().assistVisible;
        break;
      }
    }

    expect(clearedBeforeNextStep).toBe(true);
  });

  it('攻撃と攻撃のあいだに間隔を空ける', () => {
    // 仕様 §15 の IDLE 約1秒。State Machine は IDLE に滞在時間を持たず、
    // 間隔はシーケンス側の担当と定めてある。
    const clock = createFakeClock();
    const { loop, tick } = createManualLoop();
    const session = createCombatSession({
      clock,
      frameLoop: loop,
      random: () => 0,
      idleIntervalMs: 1_000,
    });

    let started = 0;
    session.eventBus.subscribe((event) => {
      if (event.type === 'ATTACK_STARTED') started += 1;
    });

    tick();
    // INTRO (3秒) を抜けて IDLE に入った直後はまだ始まらない。
    clock.advance(3_100);
    tick();
    expect(started).toBe(0);

    // 間隔を満たすと始まる。
    clock.advance(1_000);
    tick();
    expect(started).toBe(1);
  });
});
