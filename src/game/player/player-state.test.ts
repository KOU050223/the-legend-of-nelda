import { describe, expect, it } from 'vitest';

import { ARENA_RADIUS } from '@/game/arena/arena';

import { createFakeClock } from '../clock';
import {
  CHARACTER_STATS,
  COMBO_STEPS,
  COMBO_WINDOW_MS,
  DEFAULT_REVIVAL,
  ORA_VOICE_DAMAGE_MULTIPLIER_MAX,
  ORA_VOICE_DAMAGE_MULTIPLIER_MIN,
  REVIVE_INPUT_INTERVAL_MS,
  type CharacterId,
} from '../config/phase2-player-balance';
import { comboStepAt } from './attack-combo';
import {
  createPlayer,
  isAllAsleep,
  requiredReviveInputs,
  type Player,
  type PlayerAttackHit,
  type PlayerSnapshot,
} from './player-state';

type FakeClock = ReturnType<typeof createFakeClock>;

function setup(
  options: {
    characterId?: CharacterId;
    position?: { x: number; z: number };
    clock?: FakeClock;
  } = {},
) {
  const clock = options.clock ?? createFakeClock(0);
  const hits: PlayerAttackHit[] = [];
  const player = createPlayer({
    id: 'p1',
    characterId: options.characterId ?? 'PAY',
    clock,
    ...(options.position === undefined ? {} : { position: options.position }),
    onAttackHit: (hit) => hits.push(hit),
  });
  return { player, clock, hits };
}

/** 1段目を振り切るまで時間を進める。 */
function finishSwing(clock: FakeClock, player: Player, stepIndex = 0): void {
  const step = comboStepAt(stepIndex);
  clock.advance(step.windupMs + step.activeMs + step.recoverMs);
  player.update(0.016);
}

describe('移動', () => {
  it('入力した方向へ進む', () => {
    const { player, clock } = setup();

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    clock.advance(16);
    player.update(1);

    // forward の正方向は -Z (movement.ts の座標系)。
    expect(player.snapshot().position.z).toBeLessThan(0);
  });

  it('入力を止めると進まない', () => {
    const { player } = setup();

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    player.update(1);
    const moved = player.snapshot().position;

    player.submit({ type: 'MOVE', input: { forward: 0, right: 0 } });
    player.update(1);

    expect(player.snapshot().position).toEqual(moved);
  });

  it('アリーナの外へは出られない', () => {
    const { player } = setup();

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    // 十分に長い時間走り続ける。
    for (let i = 0; i < 100; i += 1) player.update(1);

    const { x, z } = player.snapshot().position;
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(ARENA_RADIUS + 0.001);
  });
});

describe('通常攻撃の3段連撃', () => {
  it('予備動作の後に判定が出る', () => {
    const { player, clock, hits } = setup();
    const step = comboStepAt(0);

    player.submit({ type: 'ATTACK' });
    clock.advance(step.windupMs - 1);
    player.update(0.016);
    expect(hits).toHaveLength(0);

    clock.advance(2);
    player.update(0.016);
    expect(hits).toHaveLength(1);
  });

  it('intensityなしのATTACKは従来どおりの基準ダメージにする', () => {
    const { player, clock, hits } = setup();

    player.submit({ type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs);
    player.update(0.016);

    expect(hits[0]?.damage).toBe(CHARACTER_STATS.PAY.attackPower);
  });

  it('オラ大輔の音声ATTACKは送信直後に即命中し、声量をダメージへ反映する（Authority側で範囲外をクランプ）', () => {
    const cases = [
      { intensity: 0, multiplier: ORA_VOICE_DAMAGE_MULTIPLIER_MIN },
      { intensity: 1, multiplier: ORA_VOICE_DAMAGE_MULTIPLIER_MAX },
      { intensity: -1, multiplier: ORA_VOICE_DAMAGE_MULTIPLIER_MIN },
      { intensity: 2, multiplier: ORA_VOICE_DAMAGE_MULTIPLIER_MAX },
    ];

    for (const { intensity, multiplier } of cases) {
      const { player, hits } = setup({ characterId: 'ORA' });
      player.submit({ type: 'ATTACK', intensity });

      // 予備動作を待たずに、送信した瞬間に命中している。
      expect(hits[0]?.damage).toBeCloseTo(CHARACTER_STATS.ORA.attackPower * multiplier);
    }
  });

  it('オラ大輔以外はintensity付きATTACKでも基準ダメージにする', () => {
    for (const characterId of ['ODORUNO', 'PAY'] as const) {
      const { player, clock, hits } = setup({ characterId });
      player.submit({ type: 'ATTACK', intensity: 1 });
      clock.advance(comboStepAt(0).windupMs);
      player.update(0.016);

      expect(hits[0]?.damage).toBe(CHARACTER_STATS[characterId].attackPower);
    }
  });

  it('オラ大輔は連呼するたびに硬直を待たず毎回命中する（他キャラの連撃制限を受けない）', () => {
    const { player, clock, hits } = setup({ characterId: 'ORA' });

    player.submit({ type: 'ATTACK', intensity: 0.5 });
    clock.advance(140);
    player.submit({ type: 'ATTACK', intensity: 0.5 });
    clock.advance(140);
    player.submit({ type: 'ATTACK', intensity: 0.5 });

    expect(hits).toHaveLength(3);
  });

  it('比較: オラ大輔以外は同じ間隔で連打しても硬直中は弾かれる', () => {
    const { player, clock, hits } = setup({ characterId: 'PAY' });

    player.submit({ type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs);
    player.update(0.016);
    clock.advance(140);
    player.submit({ type: 'ATTACK' });
    clock.advance(140);
    player.submit({ type: 'ATTACK' });
    player.update(0.016);

    expect(hits).toHaveLength(1);
  });

  it('1回の振りで二重に当たらない', () => {
    const { player, clock, hits } = setup();

    player.submit({ type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs + 1);
    player.update(0.016);
    clock.advance(10);
    player.update(0.016);

    expect(hits).toHaveLength(1);
  });

  it('続けて入力すると3段目まで繋がり、段ごとに威力が上がる', () => {
    const { player, clock, hits } = setup();

    for (let i = 0; i < COMBO_STEPS.length; i += 1) {
      player.submit({ type: 'ATTACK' });
      clock.advance(comboStepAt(i).windupMs + 1);
      player.update(0.016);
      const step = comboStepAt(i);
      clock.advance(step.activeMs + step.recoverMs);
      player.update(0.016);
    }

    expect(hits).toHaveLength(3);
    expect(hits[2]?.damage).toBeGreaterThan(hits[0]?.damage ?? 0);
  });

  it('硬直中の連打では段を飛ばせない', () => {
    const { player, clock, hits } = setup();

    player.submit({ type: 'ATTACK' });
    player.submit({ type: 'ATTACK' });
    player.submit({ type: 'ATTACK' });

    clock.advance(comboStepAt(0).windupMs + 1);
    player.update(0.016);

    expect(hits).toHaveLength(1);
  });

  it('間が空くと1段目へ戻る', () => {
    const { player, clock, hits } = setup();

    player.submit({ type: 'ATTACK' });
    finishSwing(clock, player, 0);

    clock.advance(COMBO_WINDOW_MS + 100);
    player.submit({ type: 'ATTACK' });
    clock.advance(comboStepAt(0).windupMs + 1);
    player.update(0.016);

    // 2段目 (倍率1.2) ではなく1段目 (倍率1) の威力に戻っている。
    expect(hits[1]?.damage).toBe(hits[0]?.damage);
  });

  it('処理落ちで判定の尺をまたいでもダメージが消えない', () => {
    const { player, clock, hits } = setup();
    const step = comboStepAt(0);

    player.submit({ type: 'ATTACK' });
    // 1フレームで予備動作と判定を飛び越える (バックグラウンドのタブなど)。
    clock.advance(step.windupMs + step.activeMs + step.recoverMs);
    player.update(1);

    expect(hits).toHaveLength(1);
  });

  it('攻撃を振っている間は移動しない', () => {
    const { player, clock } = setup();

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    player.submit({ type: 'ATTACK' });
    const before = player.snapshot().position;

    clock.advance(comboStepAt(0).windupMs / 2);
    player.update(0.5);

    expect(player.snapshot().position).toEqual(before);
  });
});

describe('回避', () => {
  it('無敵時間中はダメージを受けない', () => {
    const { player, clock } = setup();

    player.submit({ type: 'DODGE' });
    clock.advance(CHARACTER_STATS.PAY.dodgeInvulnerableMs - 1);

    expect(player.takeDamage(30)).toBe(CHARACTER_STATS.PAY.maxHp);
  });

  it('無敵が切れるとダメージを受ける', () => {
    const { player, clock } = setup();

    player.submit({ type: 'DODGE' });
    clock.advance(CHARACTER_STATS.PAY.dodgeInvulnerableMs + 1);
    player.takeDamage(30);

    expect(player.snapshot().hp).toBe(CHARACTER_STATS.PAY.maxHp - 30);
  });

  it('移動方向へステップする', () => {
    const { player } = setup();

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    player.submit({ type: 'DODGE' });

    expect(player.snapshot().position.z).toBeLessThan(0);
  });

  it('クールダウン中は連続で回避できない', () => {
    const { player, clock } = setup();

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    player.submit({ type: 'DODGE' });
    const afterFirst = player.snapshot().position;

    clock.advance(CHARACTER_STATS.PAY.dodgeCooldownMs - 1);
    player.submit({ type: 'DODGE' });

    expect(player.snapshot().position).toEqual(afterFirst);
  });

  it('回避は攻撃を中断する', () => {
    const { player, clock, hits } = setup();

    player.submit({ type: 'ATTACK' });
    player.submit({ type: 'DODGE' });
    clock.advance(comboStepAt(0).windupMs + 1);
    player.update(0.016);

    expect(hits).toHaveLength(0);
  });
});

describe('キャラクターごとの性能差', () => {
  it('オドルノは Pay より速く動く', () => {
    const odoruno = setup({ characterId: 'ODORUNO' });
    const pay = setup({ characterId: 'PAY' });

    for (const target of [odoruno, pay]) {
      target.player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
      target.player.update(1);
    }

    expect(Math.abs(odoruno.player.snapshot().position.z)).toBeGreaterThan(
      Math.abs(pay.player.snapshot().position.z),
    );
  });

  it('オドルノは Pay より攻撃が強く、回避の無敵が長い', () => {
    expect(CHARACTER_STATS.ODORUNO.attackPower).toBeGreaterThan(CHARACTER_STATS.PAY.attackPower);
    expect(CHARACTER_STATS.ODORUNO.dodgeInvulnerableMs).toBeGreaterThan(
      CHARACTER_STATS.PAY.dodgeInvulnerableMs,
    );
  });

  it('性能差が設定値だけで表現されている', () => {
    // コード分岐ではなくデータで差を付けていることを、設定の差し替えで示す。
    // オラへ Pay と同じ値が入っているので、挙動も一致する。
    expect(CHARACTER_STATS.ORA).toEqual(CHARACTER_STATS.PAY);
  });
});

describe('HP・睡眠・蘇生', () => {
  it('HPが0になると即退場せず、寝ようとし始める', () => {
    const { player } = setup();

    player.takeDamage(CHARACTER_STATS.PAY.maxHp);

    expect(player.snapshot().status).toBe('FALLING_ASLEEP');
    expect(player.snapshot().sleepAt).not.toBeNull();
  });

  it('倒れている間は自分では動けない', () => {
    const { player } = setup();
    player.takeDamage(999);
    const before = player.snapshot().position;

    player.submit({ type: 'MOVE', input: { forward: 1, right: 0 } });
    player.update(1);

    expect(player.snapshot().position).toEqual(before);
  });

  it('起こされないまま時間が経つと完全に寝る', () => {
    const { player, clock } = setup();

    player.takeDamage(999);
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs);
    player.update(0.016);

    expect(player.snapshot().status).toBe('ASLEEP');
  });

  it('駆け寄った仲間の連打で起き上がる', () => {
    const clock = createFakeClock(0);
    const fallen = setup({ clock }).player;
    const rescuer = createPlayer({ id: 'p2', characterId: 'ODORUNO', clock });

    fallen.takeDamage(999);

    for (let i = 0; i < requiredReviveInputs(); i += 1) {
      rescuer.reviveNeighbor(fallen);
      clock.advance(REVIVE_INPUT_INTERVAL_MS);
    }

    expect(fallen.snapshot().status).toBe('ACTIVE');
  });

  it('速く連打しても設定した時間より早くは起きない', () => {
    const clock = createFakeClock(0);
    const fallen = setup({ clock }).player;
    const rescuer = createPlayer({ id: 'p2', characterId: 'ODORUNO', clock });
    fallen.takeDamage(999);

    // 時間を進めずに叩き続ける。回数だけ数えていると一瞬で起きてしまい、
    // §5.3 の「1人で起こす：3〜4秒程度」が意味を失う。
    for (let i = 0; i < 200; i += 1) rescuer.reviveNeighbor(fallen);

    expect(fallen.snapshot().status).toBe('FALLING_ASLEEP');
    expect(fallen.snapshot().reviveInputs).toBe(1);
  });

  it('復帰HPは最大HPの一部で、短い無敵が付く', () => {
    const clock = createFakeClock(0);
    const fallen = setup({ clock }).player;
    const rescuer = createPlayer({ id: 'p2', characterId: 'ODORUNO', clock });

    fallen.takeDamage(999);
    for (let i = 0; i < requiredReviveInputs(); i += 1) {
      rescuer.reviveNeighbor(fallen);
      clock.advance(REVIVE_INPUT_INTERVAL_MS);
    }

    const revived = fallen.snapshot();
    expect(revived.hp).toBe(Math.round(revived.hpMax * DEFAULT_REVIVAL.revivedHpRatio));
    expect(revived.invulnerableUntil).toBeGreaterThan(clock.now());
  });

  it('2人で起こすと1人のときより速い', () => {
    const clock = createFakeClock(0);
    const fallen = setup({ clock }).player;
    const first = createPlayer({ id: 'p2', characterId: 'ODORUNO', clock });
    const second = createPlayer({ id: 'p3', characterId: 'ORA', clock });

    fallen.takeDamage(999);

    // 同じ回数だけ「時間が進む」状況で、2人なら倍のゲージが溜まる。
    // 同じ時間のあいだに、2人なら倍のゲージが溜まる。
    const rounds = 4;
    for (let i = 0; i < rounds; i += 1) {
      first.reviveNeighbor(fallen);
      second.reviveNeighbor(fallen);
      clock.advance(REVIVE_INPUT_INTERVAL_MS);
    }
    const withTwo = fallen.snapshot().reviveInputs;

    const soloClock = createFakeClock(0);
    const soloFallen = setup({ clock: soloClock }).player;
    const solo = createPlayer({ id: 'p4', characterId: 'ODORUNO', clock: soloClock });
    soloFallen.takeDamage(999);
    for (let i = 0; i < rounds; i += 1) {
      solo.reviveNeighbor(soloFallen);
      soloClock.advance(REVIVE_INPUT_INTERVAL_MS);
    }

    expect(withTwo).toBe(soloFallen.snapshot().reviveInputs * 2);
  });

  it('離れた場所からは起こせない', () => {
    const clock = createFakeClock(0);
    const fallen = setup({ clock }).player;
    const far = createPlayer({
      id: 'p2',
      characterId: 'ODORUNO',
      clock,
      position: { x: DEFAULT_REVIVAL.reviveRange + 5, z: 0 },
    });

    fallen.takeDamage(999);
    far.reviveNeighbor(fallen);

    expect(fallen.snapshot().reviveInputs).toBe(0);
  });

  it('完全に寝てしまった仲間は起こせない', () => {
    const clock = createFakeClock(0);
    const fallen = setup({ clock }).player;
    const rescuer = createPlayer({ id: 'p2', characterId: 'ODORUNO', clock });

    fallen.takeDamage(999);
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs);
    fallen.update(0.016);

    rescuer.reviveNeighbor(fallen);

    expect(fallen.snapshot().status).toBe('ASLEEP');
  });

  it('3人全員が寝たら敗北になる', () => {
    const clock = createFakeClock(0);
    const players = (['ODORUNO', 'PAY', 'ORA'] as const).map((characterId, index) =>
      createPlayer({ id: `p${index}`, characterId, clock }),
    );

    expect(isAllAsleep(players)).toBe(false);

    for (const player of players) player.takeDamage(999);
    clock.advance(DEFAULT_REVIVAL.sleepCountdownMs);
    for (const player of players) player.update(0.016);

    expect(isAllAsleep(players)).toBe(true);
  });
});

describe('プレイヤー状態のスナップショット', () => {
  it('JSON でそのまま往復できる', () => {
    const { player, clock } = setup();

    player.submit({ type: 'ATTACK' });
    clock.advance(50);
    player.update(0.016);

    const snapshot = player.snapshot();
    // JSON を通せること (= 関数もクラスインスタンスも入っていないこと) を
    // 検査する。複製そのものは structuredClone で行う。
    expect(JSON.parse(JSON.stringify(snapshot)) as unknown).toEqual(snapshot);
    expect(structuredClone(snapshot)).toEqual(snapshot);
  });

  it('押している移動入力も往復する', () => {
    const origin = setup();
    origin.player.submit({ type: 'MOVE', input: { forward: 1, right: -1 } });

    const replica = setup();
    replica.player.restore(structuredClone(origin.player.snapshot()));
    replica.player.update(1);

    // 復元した側が止まってしまうと、スナップショットからその後の動きを
    // 再現できない (同期を後付けする前提が崩れる)。
    expect(replica.player.snapshot().position).toEqual(
      (() => {
        origin.player.update(1);
        return origin.player.snapshot().position;
      })(),
    );
  });

  it('攻撃の途中で復元しても、同じ時刻に判定が出る', () => {
    const step = comboStepAt(0);
    const origin = setup();
    origin.player.submit({ type: 'ATTACK' });
    origin.clock.advance(step.windupMs / 2);

    const wire: PlayerSnapshot = structuredClone(origin.player.snapshot());

    const replica = setup();
    replica.clock.advance(step.windupMs / 2);
    replica.player.restore(wire);

    replica.clock.advance(step.windupMs / 2 - 1);
    replica.player.update(0.016);
    expect(replica.hits).toHaveLength(0);

    replica.clock.advance(2);
    replica.player.update(0.016);
    expect(replica.hits).toHaveLength(1);
    expect(replica.hits[0]?.damage).toBeCloseTo(CHARACTER_STATS.PAY.attackPower);
  });

  it('オラの音声ATTACKは送信直後に命中済みなので、復元しても二重に判定しない', () => {
    const origin = setup({ characterId: 'ORA' });
    origin.player.submit({ type: 'ATTACK', intensity: 1 });

    const wire: PlayerSnapshot = structuredClone(origin.player.snapshot());
    expect(wire.swing?.damageMultiplier).toBe(ORA_VOICE_DAMAGE_MULTIPLIER_MAX);
    expect(wire.swing?.hasHit).toBe(true);

    const replica = setup({ characterId: 'ORA' });
    replica.player.restore(wire);
    replica.player.update(0.016);

    expect(replica.hits).toHaveLength(0);
  });
});
