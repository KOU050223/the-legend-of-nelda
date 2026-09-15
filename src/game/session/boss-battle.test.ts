import { describe, expect, it } from 'vitest';

import { createHoriBoss, type HoriBossOptions } from '../boss/hori-boss';
import { createFakeClock } from '../clock';
import {
  BOSS_DOWN_DURATION_MS,
  DEFAULT_HORI_ATTACKS,
  type HoriAttackId,
} from '../config/phase2-boss-balance';
import {
  CHARACTER_STATS,
  DEFAULT_REVIVAL,
  REVIVE_INPUT_INTERVAL_MS,
} from '../config/phase2-player-balance';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { DEVICE_ANCHORS } from '../arena/arena';
import { comboStepAt } from '../player/attack-combo';
import { BARRIER_DEVICE_IDS, type BarrierDeviceId } from '../barrier/barrier-challenge';
import { FINALE_STATES } from '../finale/finale-state';
import { createBossBattle, type BossBattle } from './boss-battle';

function setup(
  options: { attack?: HoriAttackId; initialHp?: number; debugSkipBarriers?: boolean } = {},
) {
  const pinned = options.attack;
  const clock = createFakeClock(0);
  const events = createGameEventBus();
  const emitted: GameEvent[] = [];
  events.subscribe((event) => emitted.push(event));

  const battle = createBossBattle({
    clock,
    events,
    roster: [
      { id: 'odoruno', characterId: 'ODORUNO', position: { x: 2, z: 0 } },
      { id: 'pay', characterId: 'PAY', position: { x: 10, z: 0 } },
      { id: 'ora', characterId: 'ORA', position: { x: -10, z: 0 } },
    ],
    ...(options.debugSkipBarriers === undefined
      ? {}
      : { debugSkipBarriers: options.debugSkipBarriers }),
    createBoss: (bossOptions: HoriBossOptions) =>
      createHoriBoss({
        ...bossOptions,
        ...(pinned === undefined ? {} : { pickAttack: () => pinned }),
        ...(options.initialHp === undefined ? {} : { initialHp: options.initialHp }),
      }),
  });

  return { battle, clock, emitted };
}

function playerById(battle: BossBattle, id: string) {
  const found = battle.players.find((player) => player.snapshot().id === id);
  if (found === undefined) throw new Error(`${id} が居ない`);
  return found;
}

function devicePosition(deviceId: BarrierDeviceId) {
  const index = BARRIER_DEVICE_IDS.indexOf(deviceId);
  const anchor = DEVICE_ANCHORS[index];
  if (anchor === undefined) throw new Error(`装置 ${deviceId} の anchor が無い`);
  return { x: anchor.x, z: anchor.z };
}

function movePlayerToDevice(battle: BossBattle, playerId: string, deviceId: BarrierDeviceId) {
  const player = playerById(battle, playerId);
  player.restore({ ...player.snapshot(), position: devicePosition(deviceId) });
}

function barrierSnapshot(battle: BossBattle) {
  const barrier = battle.snapshot().barrier;
  if (barrier === null) throw new Error('結界 snapshot が無い');
  return barrier;
}

/** 最終局面そのものの細部はHoriBossの責務なので、ここではBattleの接続だけを作る。 */
function enterNoSleepMode(battle: BossBattle): void {
  const snapshot = battle.boss.snapshot();
  battle.boss.restore({
    ...snapshot,
    hp: snapshot.hpMax * 0.1,
    phase: 'NO_SLEEP_MODE',
  });
}

describe('ボスの攻撃がプレイヤーHPを削る', () => {
  it('危険範囲に居たプレイヤーのHPが減る', () => {
    const { battle, clock } = setup({ attack: 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    // 予兆が始まる。
    battle.update(0.016);
    // リングの帯の中 (内径3〜外径18) に居る pay が対象。
    clock.advance(spec.telegraphMs + 1);
    battle.update(0.016);

    expect(playerById(battle, 'pay').snapshot().hp).toBe(CHARACTER_STATS.PAY.maxHp - spec.damage);
  });

  it('足元の安全地帯に居れば減らない', () => {
    const { battle, clock } = setup({ attack: 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    battle.update(0.016);
    clock.advance(spec.telegraphMs + 1);
    battle.update(0.016);

    // odoruno は x=2 で内径3の内側に居る。
    expect(playerById(battle, 'odoruno').snapshot().hp).toBe(CHARACTER_STATS.ODORUNO.maxHp);
  });

  it('回避の無敵中は削られない', () => {
    const { battle, clock } = setup({ attack: 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    battle.update(0.016);
    clock.advance(spec.telegraphMs - 50);
    // 予兆を見てから回避する。
    battle.submit('pay', { type: 'DODGE' });
    battle.update(0.016);

    clock.advance(51);
    battle.update(0.016);

    expect(playerById(battle, 'pay').snapshot().hp).toBe(CHARACTER_STATS.PAY.maxHp);
  });

  it('一度回避した後も、無敵が切れていれば次の攻撃で削られる', () => {
    const { battle, clock } = setup({ attack: 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    // 序盤に1回回避しておく。無敵はすぐ切れる。
    battle.submit('pay', { type: 'DODGE' });
    clock.advance(CHARACTER_STATS.PAY.dodgeInvulnerableMs + 100);
    battle.update(0.016);

    // 回避で動いた分を戻し、改めて危険範囲の中に立たせる。
    const pay = playerById(battle, 'pay');
    pay.restore({ ...pay.snapshot(), position: { x: 10, z: 0 } });

    battle.update(0.016);
    clock.advance(spec.telegraphMs + 1);
    battle.update(0.016);

    expect(pay.snapshot().hp).toBeLessThan(CHARACTER_STATS.PAY.maxHp);
  });
});

describe('プレイヤーの攻撃がボスHPを削る', () => {
  it('近くで攻撃するとボスHPが減る', () => {
    const { battle, clock } = setup({ attack: 'WAKE_UP_ALARM' });
    const before = battle.boss.snapshot().hp;

    // odoruno は x=2 なのでボス (原点) へ届く。
    battle.submit('odoruno', { type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs + 1);
    battle.update(0.016);

    expect(battle.boss.snapshot().hp).toBeLessThan(before);
  });

  it('遠くから振ってもボスHPは減らない', () => {
    const { battle, clock } = setup({ attack: 'WAKE_UP_ALARM' });
    const before = battle.boss.snapshot().hp;

    // pay は x=10 で攻撃の間合い (ATTACK_REACH = 3) の外。
    battle.submit('pay', { type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs + 1);
    battle.update(0.016);

    expect(battle.boss.snapshot().hp).toBe(before);
  });
});

describe('倒れた仲間の扱い', () => {
  it('倒れた仲間はボスに狙われない', () => {
    const { battle, clock } = setup({ attack: 'BLUE_LIGHT' });

    // pay を倒す。
    playerById(battle, 'pay').takeDamage(999);
    expect(playerById(battle, 'pay').snapshot().status).toBe('FALLING_ASLEEP');

    // 何度か技を回しても、動けない相手は追尾ビームの標的にならない。
    // 狙われると技が1サイクル丸ごと無駄になる。
    for (let i = 0; i < 6; i += 1) {
      battle.update(0.016);
      const aimed = battle.boss.snapshot().activeAttack?.aim.targetId;
      expect(aimed).not.toBe('pay');
      clock.advance(3000);
      battle.update(0.016);
    }
  });

  it('駆け寄った仲間の連打で起き上がる', () => {
    const { battle, clock } = setup();
    const fallen = playerById(battle, 'pay');
    fallen.takeDamage(999);

    // odoruno を pay の隣へ動かす。
    const rescuer = playerById(battle, 'odoruno');
    rescuer.restore({ ...rescuer.snapshot(), position: { x: 10, z: 0 } });

    // 連打には間隔がある。速く叩いても設定した時間より早くは起きない。
    for (let i = 0; i < 20; i += 1) {
      battle.submit('odoruno', { type: 'REVIVE' });
      clock.advance(REVIVE_INPUT_INTERVAL_MS);
    }

    expect(fallen.snapshot().status).toBe('ACTIVE');
    expect(fallen.snapshot().hp).toBeGreaterThan(0);
  });

  it('離れた場所から連打しても起こせない', () => {
    const { battle, clock } = setup();
    const fallen = playerById(battle, 'ora');
    fallen.takeDamage(999);

    // odoruno は x=2、ora は x=-10 で蘇生範囲の外。
    for (let i = 0; i < 20; i += 1) {
      battle.submit('odoruno', { type: 'REVIVE' });
      clock.advance(REVIVE_INPUT_INTERVAL_MS);
    }

    expect(fallen.snapshot().status).toBe('FALLING_ASLEEP');
  });
});

describe('勝敗', () => {
  it('戦闘中は決着しない', () => {
    const { battle } = setup();
    expect(battle.outcome()).toBe('ONGOING');
  });

  it('3人全員が寝たら敗北', () => {
    const { battle, clock } = setup();

    for (const player of battle.players) player.takeDamage(999);
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs);
    battle.update(0.016);

    expect(battle.outcome()).toBe('DEFEAT');
  });

  it('1人でも起きていれば敗北にならない', () => {
    const { battle, clock } = setup();

    playerById(battle, 'pay').takeDamage(999);
    playerById(battle, 'ora').takeDamage(999);
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs);
    battle.update(0.016);

    expect(battle.outcome()).toBe('ONGOING');
  });

  it('ボスHPが0でも、堀大輔が眠るまでは勝利にしない', () => {
    const { battle } = setup();

    const snapshot = battle.boss.snapshot();
    battle.boss.restore({ ...snapshot, hp: 0 });

    expect(battle.outcome()).toBe('ONGOING');
  });

  it('最終演出が完了すると、HPを残したまま勝利になる', () => {
    const { battle, clock } = setup();
    enterNoSleepMode(battle);
    battle.update(0.016);
    clock.advance(4_000);
    battle.update(0.016);

    for (let index = 1; index < FINALE_STATES.length; index += 1) battle.advanceFinale();

    expect(battle.boss.snapshot().hp).toBe(battle.boss.snapshot().hpMax * 0.1);
    expect(battle.snapshot().finale).toBe('COMPLETE');
    expect(battle.outcome()).toBe('VICTORY');
  });
});

describe('最終局面のBossBattle統合', () => {
  it('デバッグ操作では、結界を経ずにHP10%の最終形態直後へ移れる', () => {
    const { battle } = setup();

    battle.debugEnterNoSleepMode();

    expect(battle.boss.snapshot().phase).toBe('NO_SLEEP_MODE');
    expect(battle.boss.snapshot().hp).toBe(battle.boss.snapshot().hpMax * 0.1);
    expect(battle.snapshot().finale).toBe('NONE');
    expect(battle.snapshot().barrier).toBeNull();
  });

  it('最終形態直後は通常操作を残し、時間経過で最終演出へ進める', () => {
    const { battle, clock } = setup();
    enterNoSleepMode(battle);
    const player = playerById(battle, 'odoruno');
    const before = player.snapshot().position;

    battle.submit('odoruno', { type: 'MOVE', input: { forward: 1, right: 0 } });
    battle.update(1);

    expect(battle.snapshot().finale).toBe('NONE');
    expect(player.snapshot().position).not.toEqual(before);

    clock.advance(4_000);
    battle.update(0.016);

    expect(battle.snapshot().finale).toBe('FINAL_STANDOFF');
  });

  it('無効化された通常攻撃を受けると、時間を待たず最終演出へ進める', () => {
    const { battle, clock } = setup();
    enterNoSleepMode(battle);
    const hp = battle.boss.snapshot().hp;

    battle.submit('odoruno', { type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs + 1);
    battle.update(0.016);

    expect(battle.boss.snapshot().hp).toBe(hp);
    expect(battle.snapshot().finale).toBe('FINAL_STANDOFF');
  });

  it('FINAL_STANDOFF以降はプレイヤー入力とBoss AIを止める', () => {
    const { battle, clock } = setup();
    enterNoSleepMode(battle);
    battle.update(0.016);
    clock.advance(4_000);
    battle.update(0.016);
    const player = playerById(battle, 'odoruno');
    const before = player.snapshot().position;

    battle.submit('odoruno', { type: 'MOVE', input: { forward: 1, right: 0 } });
    battle.update(1);

    expect(player.snapshot().position).toEqual(before);
    expect(battle.boss.snapshot().activeAttack).toBeNull();
  });
});

describe('戦闘全体のスナップショット', () => {
  it('ボスと3人ぶんをまとめて JSON で往復できる', () => {
    const { battle, clock } = setup({ attack: 'COMPRESSION_FIELD' });

    battle.update(0.016);
    clock.advance(300);
    battle.submit('odoruno', { type: 'ATTACK' });
    battle.update(0.016);

    const snapshot = battle.snapshot();
    // JSON を通せること (= 関数もクラスインスタンスも入っていないこと) を
    // 検査する。複製そのものは structuredClone で行う。
    expect(JSON.parse(JSON.stringify(snapshot)) as unknown).toEqual(snapshot);
    expect(snapshot.players).toHaveLength(3);
  });
});

describe('結界チャレンジのBossBattle統合', () => {
  it('開発用の結界スキップでは、結界を自動解除して総攻撃へ進める', () => {
    const { battle, emitted } = setup({ debugSkipBarriers: true });

    battle.boss.damage(300);
    expect(battle.snapshot().barrier).toBeNull();
    const snapshot = battle.boss.snapshot();

    expect(snapshot.phase).toBe('FIELD_ADDED');
    expect(snapshot.bossDownUntil).not.toBeNull();
    expect(emitted).toContainEqual({
      type: 'BOSS_DOWN_STARTED',
      durationMs: BOSS_DOWN_DURATION_MS,
    });
  });

  it('BARRIER_1へ入ると共有状態とPay専用viewが生成される', () => {
    const { battle } = setup();

    battle.boss.damage(300);

    const snapshot = barrierSnapshot(battle);
    const payView = battle.barrierViewFor('pay');

    expect(battle.boss.snapshot().phase).toBe('BARRIER_1');
    expect(snapshot.devices).toHaveLength(3);
    expect(payView?.solutionDeviceIds).toEqual(['DEVICE_1']);
    expect(battle.barrierViewFor('odoruno')).toBeNull();
    expect(battle.barrierViewFor('ora')).toBeNull();
    expect(JSON.stringify(battle.snapshot())).not.toContain('solutionDeviceIds');
    expect(JSON.stringify(battle.snapshot())).not.toContain('nextDeviceId');
  });

  it('ODORUNOの確保とORAの起動をBossBattleから結界へ渡してBARRIER_1を解除する', () => {
    const { battle, emitted } = setup();
    battle.boss.damage(300);
    movePlayerToDevice(battle, 'odoruno', 'DEVICE_1');
    movePlayerToDevice(battle, 'ora', 'DEVICE_1');

    battle.submit('odoruno', { type: 'INTERACT' });

    expect(barrierSnapshot(battle).devices[1]?.status).toBe('SECURED');
    expect(battle.boss.snapshot().phase).toBe('BARRIER_1');

    battle.submit('ora', { type: 'CHARACTER_ACTION' });

    expect(battle.boss.snapshot().phase).toBe('FIELD_ADDED');
    expect(battle.snapshot().barrier).toBeNull();
    expect(emitted).toContainEqual({
      type: 'BOSS_DOWN_STARTED',
      durationMs: BOSS_DOWN_DURATION_MS,
    });
  });

  it('非ACTIVE・範囲外・Role不一致は進捗を保ち、近接範囲内の誤操作だけをリセットする', () => {
    const { battle } = setup();
    battle.boss.damage(300);
    movePlayerToDevice(battle, 'odoruno', 'DEVICE_1');
    movePlayerToDevice(battle, 'ora', 'DEVICE_1');
    movePlayerToDevice(battle, 'pay', 'DEVICE_1');

    battle.submit('odoruno', { type: 'INTERACT' });
    const solutionBeforeIgnoredActions = battle.barrierViewFor('pay')?.solutionDeviceIds;

    battle.submit('pay', { type: 'INTERACT' });
    battle.submit('ora', { type: 'INTERACT' });
    battle.submit('odoruno', { type: 'CHARACTER_ACTION' });
    playerById(battle, 'ora').restore({
      ...playerById(battle, 'ora').snapshot(),
      position: { x: DEVICE_ANCHORS[1]!.x + 3 + 1e-6, z: DEVICE_ANCHORS[1]!.z },
    });
    battle.submit('ora', { type: 'CHARACTER_ACTION' });

    expect(barrierSnapshot(battle).devices[1]?.status).toBe('SECURED');
    expect(battle.barrierViewFor('pay')?.solutionDeviceIds).toEqual(solutionBeforeIgnoredActions);

    movePlayerToDevice(battle, 'odoruno', 'DEVICE_0');
    battle.submit('odoruno', { type: 'INTERACT' });

    expect(barrierSnapshot(battle).devices.map((device) => device.status)).toEqual([
      'IDLE',
      'IDLE',
      'IDLE',
    ]);
    expect(barrierSnapshot(battle).nextStepIndex).toBe(0);
    expect(barrierSnapshot(battle).securedDeviceId).toBeNull();
    expect(battle.barrierViewFor('pay')?.solutionDeviceIds).toEqual(solutionBeforeIgnoredActions);
  });

  it('BARRIER_2では各段階のACTIVATEDを保持し、正解順の最後で解除する', () => {
    const { battle, clock } = setup();
    battle.boss.damage(300);
    movePlayerToDevice(battle, 'odoruno', 'DEVICE_1');
    movePlayerToDevice(battle, 'ora', 'DEVICE_1');
    battle.submit('odoruno', { type: 'INTERACT' });
    battle.submit('ora', { type: 'CHARACTER_ACTION' });

    clock.advance(BOSS_DOWN_DURATION_MS);
    battle.update(0.016);
    battle.boss.damage(300);

    const solutionDeviceIds = battle.barrierViewFor('pay')?.solutionDeviceIds;
    if (solutionDeviceIds === undefined) throw new Error('BARRIER_2のPay viewが無い');
    expect(solutionDeviceIds).toEqual(['DEVICE_2', 'DEVICE_0', 'DEVICE_1']);
    const firstDeviceId = solutionDeviceIds[0];
    const thirdDeviceId = solutionDeviceIds[2];
    if (firstDeviceId === undefined || thirdDeviceId === undefined) {
      throw new Error('BARRIER_2の正解列が短い');
    }

    movePlayerToDevice(battle, 'odoruno', firstDeviceId);
    movePlayerToDevice(battle, 'ora', firstDeviceId);
    battle.submit('odoruno', { type: 'INTERACT' });
    battle.submit('ora', { type: 'CHARACTER_ACTION' });
    expect(barrierSnapshot(battle).nextStepIndex).toBe(1);

    movePlayerToDevice(battle, 'odoruno', thirdDeviceId);
    battle.submit('odoruno', { type: 'INTERACT' });

    expect(barrierSnapshot(battle).devices.map((device) => device.status)).toEqual([
      'IDLE',
      'IDLE',
      'IDLE',
    ]);
    expect(barrierSnapshot(battle).nextStepIndex).toBe(0);
    expect(battle.barrierViewFor('pay')?.solutionDeviceIds).toEqual(solutionDeviceIds);

    const intermediateSnapshots: Array<{
      deviceId: BarrierDeviceId;
      status: string | undefined;
      nextStepIndex: number;
      securedDeviceId: BarrierDeviceId | null;
      nextDeviceId: BarrierDeviceId | null | undefined;
    }> = [];

    for (const [index, deviceId] of solutionDeviceIds.entries()) {
      movePlayerToDevice(battle, 'odoruno', deviceId);
      movePlayerToDevice(battle, 'ora', deviceId);
      battle.submit('odoruno', { type: 'INTERACT' });
      battle.submit('ora', { type: 'CHARACTER_ACTION' });

      if (index < solutionDeviceIds.length - 1) {
        const snapshot = barrierSnapshot(battle);
        const device = snapshot.devices.find((candidate) => candidate.id === deviceId);
        intermediateSnapshots.push({
          deviceId,
          status: device?.status,
          nextStepIndex: snapshot.nextStepIndex,
          securedDeviceId: snapshot.securedDeviceId,
          nextDeviceId: battle.barrierViewFor('pay')?.nextDeviceId,
        });
      }
    }

    expect(intermediateSnapshots).toEqual([
      {
        deviceId: 'DEVICE_2',
        status: 'ACTIVATED',
        nextStepIndex: 1,
        securedDeviceId: null,
        nextDeviceId: 'DEVICE_0',
      },
      {
        deviceId: 'DEVICE_0',
        status: 'ACTIVATED',
        nextStepIndex: 2,
        securedDeviceId: null,
        nextDeviceId: 'DEVICE_1',
      },
    ]);
    expect(battle.boss.snapshot().phase).toBe('OVERDRIVE');
    expect(battle.snapshot().barrier).toBeNull();
  });

  it('FALLING_ASLEEP中は確保状態を維持し、既存の蘇生後に再開できる', () => {
    const { battle, clock } = setup();
    battle.boss.damage(300);
    movePlayerToDevice(battle, 'odoruno', 'DEVICE_1');
    movePlayerToDevice(battle, 'ora', 'DEVICE_1');
    battle.submit('odoruno', { type: 'INTERACT' });

    const ora = playerById(battle, 'ora');
    ora.takeDamage(999);
    battle.submit('ora', { type: 'CHARACTER_ACTION' });

    expect(barrierSnapshot(battle).devices[1]?.status).toBe('SECURED');
    expect(battle.barrierViewFor('pay')).not.toBeNull();

    const odoruno = playerById(battle, 'odoruno');
    for (let i = 0; i < 20; i += 1) {
      battle.submit('odoruno', { type: 'REVIVE' });
      clock.advance(REVIVE_INPUT_INTERVAL_MS);
    }

    expect(ora.snapshot().status).toBe('ACTIVE');
    battle.submit('ora', { type: 'CHARACTER_ACTION' });
    expect(battle.boss.snapshot().phase).toBe('FIELD_ADDED');

    const pay = playerById(battle, 'pay');
    pay.takeDamage(999);
    expect(battle.barrierViewFor('pay')).toBeNull();
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs);
    battle.update(0.016);
    expect(pay.snapshot().status).toBe('ASLEEP');
    expect(battle.barrierViewFor('pay')).toBeNull();
    expect(odoruno.snapshot().status).toBe('ACTIVE');
  });
});
