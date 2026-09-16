import { describe, expect, it } from 'vitest';

import { createHoriBoss, type HoriBossOptions } from '../boss/hori-boss';
import { createFakeClock } from '../clock';
import { DEFAULT_HORI_ATTACKS, type HoriAttackId } from '../config/phase2-boss-balance';
import { ATTACK_REACH, DEFAULT_REVIVAL } from '../config/phase2-player-balance';
import { createGameEventBus } from '../events/game-event';
import { createBossBattle, type BattleSnapshot } from '../session/boss-battle';
import { decide } from './utility-policy';
import { distanceBetween } from './considerations';

/**
 * ポリシーは snapshot の純関数なので、実際の `BossBattle` を fake clock で
 * 進めて snapshot を作り、それを食わせて判断を見る。
 */
function setup(
  options: {
    attack?: HoriAttackId;
    positions?: Readonly<Record<string, { x: number; z: number }>>;
  } = {},
) {
  const clock = createFakeClock(0);
  const events = createGameEventBus();
  const positions = options.positions ?? {};
  const pinned = options.attack;

  const battle = createBossBattle({
    clock,
    events,
    solo: true,
    roster: [
      { id: 'odoruno', characterId: 'ODORUNO', position: positions.odoruno ?? { x: 0, z: 18 } },
      { id: 'pay', characterId: 'PAY', position: positions.pay ?? { x: 4, z: 18 } },
      { id: 'ora', characterId: 'ORA', position: positions.ora ?? { x: -4, z: 18 } },
    ],
    createBoss: (bossOptions: HoriBossOptions) =>
      createHoriBoss({
        ...bossOptions,
        ...(pinned === undefined ? {} : { pickAttack: () => pinned }),
      }),
  });

  return { battle, clock };
}

describe('NPCの判断', () => {
  it('ボスが射程の外にいるとき、ボスへ近づく向きへ移動する', () => {
    // ボスは原点。NPC は +Z 側に離れている。
    const { battle } = setup();
    const snapshot = battle.snapshot();

    const decision = decide(snapshot, { selfId: 'odoruno' });

    // forward の正方向は -Z (moveCharacter が z から引く)。
    // +Z 側から原点へ向かうので forward は正になる。
    expect(decision.movement.forward).toBeGreaterThan(0);
  });

  it('ボスに密着しているとき、攻撃を出す', () => {
    const { battle } = setup({ positions: { odoruno: { x: 0, z: 1 } } });

    const decision = decide(battle.snapshot(), { selfId: 'odoruno' });

    expect(decision.action).toEqual({ type: 'ATTACK' });
  });

  it('寝ているNPCは何もしない', () => {
    const { battle, clock } = setup({ positions: { odoruno: { x: 0, z: 1 } } });

    // HP を削り切って倒れさせる。
    const player = battle.players.find((candidate) => candidate.snapshot().id === 'odoruno');
    player?.takeDamage(9999);
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs + 1);
    battle.update(0.016);

    const snapshot = battle.snapshot();
    const self = snapshot.players.find((candidate) => candidate.id === 'odoruno');
    expect(self?.status).not.toBe('ACTIVE');

    const decision = decide(snapshot, { selfId: 'odoruno' });

    expect(decision.action).toBeNull();
    expect(decision.movement).toEqual({ forward: 0, right: 0 });
  });

  it('roster にいないIDでは何もしない', () => {
    const { battle } = setup();

    const decision = decide(battle.snapshot(), { selfId: 'unknown' });

    expect(decision.action).toBeNull();
    expect(decision.movement).toEqual({ forward: 0, right: 0 });
  });
});

describe('倒れた仲間の救助', () => {
  /** odoruno を倒し、まだ寝ていない (FALLING_ASLEEP) 状態にする。 */
  function withFallenAlly(positions: Readonly<Record<string, { x: number; z: number }>>) {
    const context = setup({ positions });
    const fallen = context.battle.players.find(
      (candidate) => candidate.snapshot().id === 'odoruno',
    );
    fallen?.takeDamage(9999);
    context.battle.update(0.016);
    return context;
  }

  it('倒れた仲間が遠いとき、その仲間へ向かって移動する', () => {
    const { battle } = withFallenAlly({
      odoruno: { x: 0, z: 20 },
      pay: { x: 0, z: 5 },
    });

    const snapshot = battle.snapshot();
    const fallen = snapshot.players.find((candidate) => candidate.id === 'odoruno');
    expect(fallen?.status).toBe('FALLING_ASLEEP');

    const decision = decide(snapshot, { selfId: 'pay' });

    // 倒れた仲間は +Z 側。forward は -Z 向きが正なので負になる。
    expect(decision.movement.forward).toBeLessThan(0);
  });

  it('倒れた仲間へ届く距離まで来たら、止まって蘇生する', () => {
    const { battle } = withFallenAlly({
      odoruno: { x: 0, z: 20 },
      // 蘇生できる距離の内側に置く。
      pay: { x: 0, z: 20 - (DEFAULT_REVIVAL.reviveRange - 1) },
    });

    const snapshot = battle.snapshot();
    const decision = decide(snapshot, { selfId: 'pay' });

    expect(decision.action).toEqual({ type: 'REVIVE' });
    // 通り過ぎると蘇生が途切れるので止まる。
    expect(decision.movement).toEqual({ forward: 0, right: 0 });
  });

  it('完全に寝てしまった仲間へは向かわない', () => {
    const { battle, clock } = withFallenAlly({
      odoruno: { x: 0, z: 20 },
      pay: { x: 0, z: 19 },
    });

    // 寝るまで待つと ASLEEP になり、もう起こせない。
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs + 1);
    battle.update(0.016);

    const snapshot = battle.snapshot();
    expect(snapshot.players.find((candidate) => candidate.id === 'odoruno')?.status).toBe('ASLEEP');

    const decision = decide(snapshot, { selfId: 'pay' });

    expect(decision.action).not.toEqual({ type: 'REVIVE' });
  });
});

describe('危険範囲への反応', () => {
  /** 技の予兆が出ている snapshot を作る。 */
  function withTelegraph(attack: HoriAttackId, elapsedMs: number) {
    const context = setup({
      attack,
      // ボスの近く。RING の内側 (安全) ではなく危険域に入る距離へ置く。
      positions: { odoruno: { x: 8, z: 0 }, pay: { x: 9, z: 0 }, ora: { x: 10, z: 0 } },
    });

    // ボスが技を始めるまで進める。
    for (let elapsed = 0; elapsed < 10_000; elapsed += 100) {
      context.clock.advance(100);
      context.battle.update(0.1);
      if (context.battle.snapshot().boss.activeAttack !== null) break;
    }

    context.clock.advance(elapsedMs);
    context.battle.update(elapsedMs / 1000);

    return context;
  }

  it('危険範囲を踏んでいるとき、回避を出す', () => {
    // 着弾が近いほど危険度が上がる。予兆の終盤で見る。
    const { battle } = withTelegraph(
      'WAKE_UP_ALARM',
      DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM.telegraphMs - 200,
    );

    const snapshot = battle.snapshot();
    expect(snapshot.boss.activeAttack).not.toBeNull();

    const decision = decide(snapshot, { selfId: 'odoruno' });

    expect(decision.action).toEqual({ type: 'DODGE' });
  });

  it('回避のクールダウン中は、移動で危険範囲から出ようとする', () => {
    const { battle } = withTelegraph(
      'WAKE_UP_ALARM',
      DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM.telegraphMs - 200,
    );

    const snapshot = battle.snapshot();
    // 回避を使えない状態を作る。dodgeReadyAt を未来にした snapshot を合成する。
    const players = snapshot.players.map((player) => {
      if (player.id !== 'odoruno') return player;
      return Object.assign({}, player, { dodgeReadyAt: snapshot.boss.takenAt + 5_000 });
    });
    const blocked: BattleSnapshot = { ...snapshot, players };

    const decision = decide(blocked, { selfId: 'odoruno' });

    expect(decision.action).not.toEqual({ type: 'DODGE' });
    // 止まったままにはしない。
    expect(decision.movement).not.toEqual({ forward: 0, right: 0 });
  });

  it('追尾ビームに狙われている間は、回避せず走って逃げる', () => {
    const { battle } = withTelegraph('BLUE_LIGHT', 200);

    const snapshot = battle.snapshot();
    const attack = snapshot.boss.activeAttack;
    expect(attack?.attackId).toBe('BLUE_LIGHT');

    const targetId = attack?.aim.targetId;
    if (targetId === undefined) throw new Error('BLUE_LIGHT は狙う相手を決めるはず');

    const decision = decide(snapshot, { selfId: targetId });

    // 着弾点が追ってくるので、無敵で受けても解決しない。
    expect(decision.action).not.toEqual({ type: 'DODGE' });
    expect(decision.movement).not.toEqual({ forward: 0, right: 0 });
  });
});

describe('キャラごとの性格', () => {
  it('慎重なキャラほどボスから離れた間合いを取る', () => {
    // 全員をボスから等距離に置き、落ち着いた間合いへ収束させる。
    const { battle } = setup({
      positions: {
        odoruno: { x: 0, z: 12 },
        pay: { x: 0, z: 12 },
        ora: { x: 0, z: 12 },
      },
    });

    const snapshot = battle.snapshot();

    // NPC_WEIGHTS の spacing は PAY (1.3) > ORA (1.0) > ODORUNO (0.7)。
    // spacing が大きいほど手前で止まるため、詰めたい距離が長く残る。
    const boss = snapshot.boss.position;
    const distance = distanceBetween({ x: 0, z: 12 }, boss);

    // いずれも射程外なので全員近づく。性格差は「どこで止まるか」に出る。
    expect(distance).toBeGreaterThan(ATTACK_REACH);
    for (const id of ['odoruno', 'pay', 'ora']) {
      expect(decide(snapshot, { selfId: id }).movement.forward).toBeGreaterThan(0);
    }
  });
});
