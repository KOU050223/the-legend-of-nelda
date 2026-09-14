import { describe, expect, it } from 'vitest';

import { createHoriBoss, type HoriBossOptions } from '../boss/hori-boss';
import { createFakeClock } from '../clock';
import { DEFAULT_HORI_ATTACKS, type HoriAttackId } from '../config/phase2-boss-balance';
import {
  CHARACTER_STATS,
  DEFAULT_REVIVAL,
  REVIVE_INPUT_INTERVAL_MS,
} from '../config/phase2-player-balance';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { comboStepAt } from '../player/attack-combo';
import { createBossBattle, type BossBattle } from './boss-battle';

function setup(options: { attack?: HoriAttackId } = {}) {
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
    createBoss: (bossOptions: HoriBossOptions) =>
      createHoriBoss(
        pinned === undefined ? bossOptions : { ...bossOptions, pickAttack: () => pinned },
      ),
  });

  return { battle, clock, emitted };
}

function playerById(battle: BossBattle, id: string) {
  const found = battle.players.find((player) => player.snapshot().id === id);
  if (found === undefined) throw new Error(`${id} が居ない`);
  return found;
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

  it('ボスHPが尽きたら勝利', () => {
    const { battle } = setup();

    // 結界と NO SLEEP MODE を抜けながら削り切る。
    for (let i = 0; i < 200; i += 1) {
      const snapshot = battle.boss.snapshot();
      if (snapshot.hp <= 0) break;
      if (snapshot.phase === 'BARRIER_1' || snapshot.phase === 'BARRIER_2') {
        battle.boss.breakBarrier();
        continue;
      }
      if (snapshot.phase === 'NO_SLEEP_MODE') {
        // 最終フェーズは通常攻撃で削れない (§12)。ここでは決着の形だけ見る。
        battle.boss.restore({ ...snapshot, hp: 0 });
        break;
      }
      battle.boss.damage(50);
    }

    expect(battle.outcome()).toBe('VICTORY');
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
