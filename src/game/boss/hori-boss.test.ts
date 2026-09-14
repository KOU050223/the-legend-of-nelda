import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';

type FakeClock = ReturnType<typeof createFakeClock>;
import {
  BLUE_LIGHT_TRACKING_SPEED,
  BOSS_DOWN_DURATION_MS,
  DEFAULT_HORI_ATTACKS,
  HORI_INITIAL_HP,
  OVERDRIVE_MODIFIERS,
} from '../config/phase2-boss-balance';
import { createGameEventBus, type GameEvent } from '../events/game-event';
import { NO_SLEEP_MODE_HP_RATIO } from './boss-phase';
import { bossMoveSpeed, createHoriBoss, type BossSnapshot, type HoriBoss } from './hori-boss';
import type { BossTarget, DamageHit } from './boss-target';

/**
 * スナップショットを1往復させる。同期でネットワークへ出す状況を再現する。
 *
 * `structuredClone` は関数やクラスインスタンスが混ざっていると例外を投げる。
 * 「シリアライズ可能であること」自体をここで検査していることになる。
 */
function reserialize(snapshot: BossSnapshot): BossSnapshot {
  return structuredClone(snapshot);
}

function setup(options: { pickAttack?: Parameters<typeof createHoriBoss>[0]['pickAttack'] } = {}) {
  const clock = createFakeClock(0);
  const events = createGameEventBus();
  const emitted: GameEvent[] = [];
  events.subscribe((event) => emitted.push(event));
  const hits: DamageHit[] = [];

  const boss = createHoriBoss({
    clock,
    events,
    damageSink: { applyDamage: (hit) => hits.push(hit) },
    ...(options.pickAttack === undefined ? {} : { pickAttack: options.pickAttack }),
  });

  return { boss, clock, emitted, hits };
}

/**
 * ボスを指定フェーズまで削る。結界は breakBarrier() で抜ける。
 * 抜けた直後の BOSS DOWN は、技の検証を邪魔しないように明けさせておく。
 */
function driveToPhase(boss: HoriBoss, targetPhase: string, clock: FakeClock): void {
  for (let i = 0; i < 100; i += 1) {
    const snapshot = boss.snapshot();
    if (snapshot.phase === targetPhase) {
      if (snapshot.bossDownUntil !== null) {
        clock.advance(BOSS_DOWN_DURATION_MS);
        boss.update([]);
      }
      return;
    }
    if (snapshot.phase === 'BARRIER_1' || snapshot.phase === 'BARRIER_2') {
      boss.breakBarrier();
      clock.advance(BOSS_DOWN_DURATION_MS);
      boss.update([]);
      continue;
    }
    boss.damage(HORI_INITIAL_HP * 0.05);
  }
  throw new Error(`${targetPhase} へ到達しなかった`);
}

describe('堀大輔のHPとフェーズ', () => {
  it('ダメージでHPが減り、外へ通知される', () => {
    const { boss, emitted } = setup();
    boss.damage(100);

    expect(boss.snapshot().hp).toBe(HORI_INITIAL_HP - 100);
    // Phase 1 の BOSS_HP_CHANGED とは別イベント。分母を添えるので、
    // 購読側が INITIAL_BOSS_HP (= 100) を前提にしてゲージが壊れない。
    expect(emitted).toContainEqual({
      type: 'HORI_HP_CHANGED',
      hp: HORI_INITIAL_HP - 100,
      hpMax: HORI_INITIAL_HP,
    });
  });

  it('通常攻撃では NO SLEEP MODE の手前で止まる', () => {
    const { boss } = setup();
    boss.damage(HORI_INITIAL_HP * 2);

    // 10% を通り越して 0 まで落ちると、最終局面 (§12) ごと飛ばして
    // 勝ててしまう。通常攻撃のダメージはここで止める。
    expect(boss.snapshot().hp).toBe(HORI_INITIAL_HP * NO_SLEEP_MODE_HP_RATIO);

    boss.restore({ ...boss.snapshot(), hp: HORI_INITIAL_HP, phase: 'INTRO' });
    boss.damage(-500);
    expect(boss.snapshot().hp).toBe(HORI_INITIAL_HP);
  });

  it('フェーズ境界を跨ぐと外へ通知される', () => {
    const { boss, emitted } = setup();
    boss.damage(HORI_INITIAL_HP * 0.3);

    expect(boss.snapshot().phase).toBe('BARRIER_1');
    expect(emitted).toContainEqual({
      type: 'BOSS_PHASE_CHANGED',
      from: 'INTRO',
      to: 'BARRIER_1',
    });
  });

  it('結界へ入ると進行中の技が打ち切られる', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;
    const targets = [{ id: 'pay', position: { x: 10, z: 0 } }];

    boss.update(targets);
    // 予兆中に70%を割って結界へ入る。
    boss.damage(HORI_INITIAL_HP * 0.3);
    expect(boss.snapshot().phase).toBe('BARRIER_1');

    clock.advance(spec.telegraphMs + 1);
    boss.update(targets);

    // BOSS INVINCIBLE を宣言した後も殴ってくると、協力ギミックが成立しない。
    expect(hits).toEqual([]);
    expect(boss.snapshot().activeAttack).toBeNull();
  });

  it('結界中は攻撃が通らず、0 DAMAGE として通知される', () => {
    const { boss, emitted } = setup();
    boss.damage(HORI_INITIAL_HP * 0.3);
    const hpAtBarrier = boss.snapshot().hp;

    emitted.length = 0;
    boss.damage(200);

    expect(boss.snapshot().hp).toBe(hpAtBarrier);
    expect(emitted).toContainEqual({ type: 'BOSS_DAMAGE_NULLIFIED', phase: 'BARRIER_1' });
  });

  it('NO SLEEP MODE では通常攻撃でHPを削れない', () => {
    const { boss, clock } = setup();
    driveToPhase(boss, 'NO_SLEEP_MODE', clock);
    const hp = boss.snapshot().hp;

    boss.damage(500);
    expect(boss.snapshot().hp).toBe(hp);
  });
});

describe('BOSS DOWN から通常戦闘へ戻る', () => {
  it('結界を解除するとフェーズが進み BOSS DOWN になる', () => {
    const { boss, emitted } = setup();
    boss.damage(HORI_INITIAL_HP * 0.3);
    emitted.length = 0;

    boss.breakBarrier();

    expect(boss.snapshot().phase).toBe('FIELD_ADDED');
    expect(boss.snapshot().bossDownUntil).not.toBeNull();
    expect(emitted).toContainEqual({
      type: 'BOSS_DOWN_STARTED',
      durationMs: BOSS_DOWN_DURATION_MS,
    });
  });

  it('BOSS DOWN 中は総攻撃が通り、技を出してこない', () => {
    const { boss, clock, emitted } = setup();
    boss.damage(HORI_INITIAL_HP * 0.3);
    boss.breakBarrier();
    const hpAtDown = boss.snapshot().hp;

    emitted.length = 0;
    clock.advance(BOSS_DOWN_DURATION_MS / 2);
    boss.update([]);
    boss.damage(50);

    expect(boss.snapshot().hp).toBe(hpAtDown - 50);
    expect(boss.snapshot().activeAttack).toBeNull();
    expect(emitted.some((event) => event.type === 'BOSS_ATTACK_STARTED')).toBe(false);
  });

  it('総攻撃で境界を割っても、ダウン中は追撃し続けられる', () => {
    const { boss, clock } = setup();
    boss.damage(HORI_INITIAL_HP * 0.3);
    boss.breakBarrier();

    // 総攻撃の途中で40%を割る。ここで結界へ入ってしまうと、残りの
    // ダウン時間の追撃が全部無効になり、ご褒美が黙って消える。
    boss.damage(HORI_INITIAL_HP * 0.35);
    const midway = boss.snapshot().hp;

    boss.damage(50);
    expect(boss.snapshot().hp).toBe(midway - 50);

    // 持ち越した分はダウンが明けた時点で反映される。
    clock.advance(BOSS_DOWN_DURATION_MS);
    boss.update([]);
    expect(boss.snapshot().phase).toBe('BARRIER_2');
  });

  it('総攻撃で削り切っても NO SLEEP MODE を飛ばせない', () => {
    const { boss, clock } = setup();

    boss.damage(HORI_INITIAL_HP * 0.3);
    boss.breakBarrier();
    clock.advance(BOSS_DOWN_DURATION_MS);
    boss.update([]);

    boss.damage(HORI_INITIAL_HP * 0.3);
    boss.breakBarrier();

    // 総攻撃中にありったけ叩き込む。ここで 0 まで落ちると、通常攻撃では
    // 倒せないはずの最終局面 (§12) ごと飛ばして勝ててしまう。
    boss.damage(HORI_INITIAL_HP);

    expect(boss.snapshot().hp).toBe(HORI_INITIAL_HP * NO_SLEEP_MODE_HP_RATIO);
    expect(boss.snapshot().phase).toBe('NO_SLEEP_MODE');
  });

  it('BOSS DOWN が明けると通常戦闘へ戻り、また技を出す', () => {
    const { boss, clock, emitted } = setup();
    boss.damage(HORI_INITIAL_HP * 0.3);
    boss.breakBarrier();

    clock.advance(BOSS_DOWN_DURATION_MS);
    boss.update([]);
    expect(emitted).toContainEqual({ type: 'BOSS_DOWN_ENDED' });

    clock.advance(10_000);
    boss.update([]);
    expect(boss.snapshot().activeAttack).not.toBeNull();
  });
});

describe('通常攻撃の予兆と被弾', () => {
  const targets: BossTarget[] = [{ id: 'oddoruno', position: { x: 10, z: 0 } }];

  it('予兆の間は当たらず、判定が出てから当たる', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    boss.update(targets);
    expect(boss.snapshot().activeAttack?.attackId).toBe('WAKE_UP_ALARM');

    // 予兆中は危険範囲が見えているが、まだ減らない。
    clock.advance(spec.telegraphMs - 1);
    boss.update(targets);
    expect(boss.dangerZones(targets)).toHaveLength(1);
    expect(hits).toHaveLength(0);

    clock.advance(2);
    boss.update(targets);
    expect(hits).toEqual([{ targetId: 'oddoruno', amount: spec.damage }]);
  });

  it('予兆の間に危険範囲の外へ出れば当たらない', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    boss.update(targets);
    // リングの外側まで逃げる。
    const escaped: BossTarget[] = [{ id: 'oddoruno', position: { x: 25, z: 0 } }];

    clock.advance(spec.telegraphMs + 1);
    boss.update(escaped);

    expect(hits).toHaveLength(0);
  });

  it('回避の無敵中は判定を素通りする', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    boss.update(targets);

    clock.advance(DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM.telegraphMs + 1);
    boss.update([{ id: 'oddoruno', position: { x: 10, z: 0 }, invulnerable: true }]);

    expect(hits).toHaveLength(0);
  });

  it('処理落ちで判定の尺をまたいでも被弾が消えない', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    boss.update(targets);
    // 1フレームで予兆・判定・硬直をまたぐ (バックグラウンドのタブなど)。
    // ここで判定を捨てると、当たっていたはずの攻撃が黙って無かったことになる。
    clock.advance(spec.telegraphMs + spec.activeMs + spec.recoverMs);
    boss.update(targets);

    expect(hits).toEqual([{ targetId: 'oddoruno', amount: spec.damage }]);
  });

  it('1つの技で同じ相手に二重に当たらない', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    boss.update(targets);
    clock.advance(spec.telegraphMs + 1);
    boss.update(targets);
    clock.advance(100);
    boss.update(targets);

    expect(hits).toHaveLength(1);
  });

  it('判定が終わったら危険範囲が消える', () => {
    const { boss, clock } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;

    boss.update(targets);
    // 予兆中と判定中は見えている。
    expect(boss.dangerZones(targets)).toHaveLength(1);
    clock.advance(spec.telegraphMs + 1);
    boss.update(targets);
    expect(boss.dangerZones(targets)).toHaveLength(1);

    // 硬直へ入ったら消える。残ると安全な場所が危険に見える。
    clock.advance(spec.activeMs);
    boss.update(targets);
    expect(boss.dangerZones(targets)).toEqual([]);
  });

  it('危険範囲が消えた後から入ってきた相手には当たらない', () => {
    const { boss, clock, hits } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;
    const away = [{ id: 'pay', position: { x: 40, z: 0 } }];

    boss.update(away);
    // 判定中は範囲の外に居る。
    clock.advance(spec.telegraphMs + 1);
    boss.update(away);
    expect(hits).toEqual([]);

    // 硬直へ入り、表示が消えてから範囲へ歩いてくる。
    clock.advance(spec.activeMs);
    expect(boss.dangerZones(away)).toEqual([]);
    boss.update([{ id: 'pay', position: { x: 10, z: 0 } }]);

    // 見えていない範囲で殴られてはいけない。
    expect(hits).toEqual([]);
  });

  it('技が終わると通知され、次の技へ進む', () => {
    const { boss, clock, emitted } = setup({ pickAttack: () => 'MORNING_DASH' });
    const spec = DEFAULT_HORI_ATTACKS.MORNING_DASH;

    boss.update(targets);
    clock.advance(spec.telegraphMs + spec.activeMs + spec.recoverMs);
    boss.update(targets);

    expect(emitted).toContainEqual({ type: 'BOSS_ATTACK_ENDED', attackId: 'MORNING_DASH' });
    expect(boss.snapshot().activeAttack).toBeNull();
  });
});

describe('4技がそれぞれ異なる対処を要求する', () => {
  const three: BossTarget[] = [
    { id: 'pay', position: { x: 4, z: 0 } },
    { id: 'oddoruno', position: { x: 0, z: -12 } },
    { id: 'ora', position: { x: 20, z: 20 } },
  ];

  it('絶対起床アラームは全方位で、足元だけが安全', () => {
    const { boss } = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    boss.update(three);
    const zones = boss.dangerZones(three);

    expect(zones).toHaveLength(1);
    expect(zones[0]?.shape.kind).toBe('RING');
  });

  it('ブルーライト照射は1人を狙い、着弾点が追ってくる', () => {
    const { boss, clock } = setup({ pickAttack: () => 'BLUE_LIGHT' });
    boss.update(three);

    const aimedId = boss.snapshot().activeAttack?.aim.targetId;
    expect(aimedId).toBeDefined();

    const start = boss.dangerZones(three)[0]?.origin;
    // 着弾点はボスが1フレームずつ進める。時計だけ進めても動かない
    // (経過時間から引き直すと、横移動で追尾速度を超えてしまうため)。
    clock.advance(500);
    boss.update(three);
    const later = boss.dangerZones(three)[0]?.origin;

    const aimed = three.find((target) => target.id === aimedId);
    const distanceBefore = Math.hypot(
      (start?.x ?? 0) - (aimed?.position.x ?? 0),
      (start?.z ?? 0) - (aimed?.position.z ?? 0),
    );
    const distanceAfter = Math.hypot(
      (later?.x ?? 0) - (aimed?.position.x ?? 0),
      (later?.z ?? 0) - (aimed?.position.z ?? 0),
    );
    expect(distanceAfter).toBeLessThan(distanceBefore);
  });

  it('横へ走ってもビームは追尾速度を超えて追ってこない', () => {
    const { boss, clock } = setup({ pickAttack: () => 'BLUE_LIGHT' });
    const near = [{ id: 'pay', position: { x: 0, z: -20 } }];
    boss.update(near);

    clock.advance(500);
    boss.update(near);
    const before = boss.dangerZones(near)[0]?.origin;

    // 真横へ大きく飛ぶ。経過時間から引き直す実装だと、着弾点が
    // 追尾速度を無視して横滑りし、走って振り切れなくなる。
    const away = [{ id: 'pay', position: { x: 20, z: 0 } }];
    clock.advance(100);
    boss.update(away);
    const after = boss.dangerZones(away)[0]?.origin;

    const moved = Math.hypot(
      (after?.x ?? 0) - (before?.x ?? 0),
      (after?.z ?? 0) - (before?.z ?? 0),
    );
    expect(moved).toBeLessThanOrEqual((BLUE_LIGHT_TRACKING_SPEED * 100) / 1000 + 0.001);
  });

  it('2回目以降の照射でも、開始直後に着弾点が飛ばない', () => {
    const { boss, clock } = setup({ pickAttack: () => 'BLUE_LIGHT' });
    const targets = [{ id: 'pay', position: { x: 20, z: 0 } }];

    const step = 50;
    // 1回目を最後まで回し、技と技の待ち時間を挟んで2回目へ入る。待ち時間ぶんの
    // 経過を次の技の初回フレームへ渡すと、着弾点が追尾速度を無視して一気に飛ぶ。
    // 2回目の照射で1フレームあたりに動いた距離をすべて集めてから検査する。
    const movesInSecondBeam: number[] = [];
    let previous: { x: number; z: number } | null = null;
    let beamCount = 0;

    for (let i = 0; i < 400; i += 1) {
      boss.update(targets);
      const origin = boss.snapshot().activeAttack?.beamOrigin ?? null;

      if (origin === null) {
        // 技が終わった。次に始まるものを数える。
        previous = null;
      } else {
        if (previous === null) beamCount += 1;
        else if (beamCount >= 2) {
          movesInSecondBeam.push(Math.hypot(origin.x - previous.x, origin.z - previous.z));
        }
        previous = { x: origin.x, z: origin.z };
      }

      clock.advance(step);
    }

    const allowed = (BLUE_LIGHT_TRACKING_SPEED * step) / 1000 + 0.001;
    expect(movesInSecondBeam.length).toBeGreaterThan(0);
    expect(Math.max(...movesInSecondBeam)).toBeLessThanOrEqual(allowed);
  });

  it('睡眠時間圧縮フィールドは複数箇所を危険にし、安全地帯が残る', () => {
    const { boss } = setup({ pickAttack: () => 'COMPRESSION_FIELD' });
    boss.update(three);
    const zones = boss.dangerZones(three);

    expect(zones.length).toBeGreaterThan(1);
    // 全面が危険になってはいけない。安全地帯へ移動できることが対処
    // なので、どこにも逃げ場が無いと技として成立しない。
    const covered = zones.filter((zone) =>
      three.some(
        (target) =>
          Math.hypot(zone.origin.x - target.position.x, zone.origin.z - target.position.z) < 0.001,
      ),
    );
    expect(covered.length).toBeLessThan(zones.length);
  });

  it('早朝ルーティン突進はボス自身が軌道上を進むが、危険範囲は動かない', () => {
    const { boss, clock } = setup({ pickAttack: () => 'MORNING_DASH' });
    boss.update(three);
    const spec = DEFAULT_HORI_ATTACKS.MORNING_DASH;
    const zoneBefore = boss.dangerZones(three)[0];

    clock.advance(spec.telegraphMs + 200);
    boss.update(three);

    // 軌道の長さと判定の尺から逆算した速さで進む。通常の移動速度のままだと
    // 30 ユニットの帯を2ユニットしか進まず、突進に見えない。
    const moved = boss.snapshot().position;
    expect(Math.hypot(moved.x, moved.z)).toBeGreaterThan(5);
    // 予兆で見せた軌道が動くと「横へ回避する」が成立しない。
    expect(boss.dangerZones(three)[0]?.origin).toEqual(zoneBefore?.origin);
  });

  it('早朝ルーティン突進は直線で、予兆の後に狙いが変わらない', () => {
    const { boss, clock } = setup({ pickAttack: () => 'MORNING_DASH' });
    boss.update(three);
    const before = boss.dangerZones(three)[0];

    // 狙われた側が動いても軌道は動かない。だから横へ回避できる。
    clock.advance(600);
    const after = boss.dangerZones([{ id: 'pay', position: { x: -20, z: 20 } }])[0];

    expect(before?.shape.kind).toBe('LINE');
    expect(after?.rotationY).toBe(before?.rotationY);
  });
});

describe('カフェイン・オーバードライブ', () => {
  it('後半フェーズでは予兆が短くなる', () => {
    const { boss: normal } = setup({ pickAttack: () => 'MORNING_DASH' });
    normal.update([]);
    const before = normal.snapshot().activeAttack?.timing.telegraphMs;

    const { boss: fast, clock: fastClock } = setup({ pickAttack: () => 'MORNING_DASH' });
    driveToPhase(fast, 'OVERDRIVE', fastClock);
    fastClock.advance(10_000);
    fast.update([]);
    const after = fast.snapshot().activeAttack?.timing.telegraphMs;

    expect(after).toBeLessThan(before ?? 0);
    expect(after).toBe(
      DEFAULT_HORI_ATTACKS.MORNING_DASH.telegraphMs * OVERDRIVE_MODIFIERS.telegraphScale,
    );
  });

  it('後半フェーズでは移動が速くなる', () => {
    expect(bossMoveSpeed('OVERDRIVE')).toBeGreaterThan(bossMoveSpeed('INTRO'));
  });

  it('後半フェーズでも新しい技は増えない', () => {
    // §10「新しい攻撃を大量追加せず、既存攻撃を高速化・複合化する」。
    const { boss, clock } = setup();
    driveToPhase(boss, 'OVERDRIVE', clock);
    clock.advance(10_000);

    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      boss.update([]);
      const attackId = boss.snapshot().activeAttack?.attackId;
      if (attackId !== undefined) seen.add(attackId);
      boss.restore({ ...boss.snapshot(), activeAttack: null, nextAttackAt: 0 });
    }

    for (const attackId of seen) {
      expect(Object.keys(DEFAULT_HORI_ATTACKS)).toContain(attackId);
    }
  });
});

describe('ボス状態のスナップショット', () => {
  it('JSON でそのまま往復できる', () => {
    const { boss, clock } = setup({ pickAttack: () => 'COMPRESSION_FIELD' });
    boss.update([{ id: 'pay', position: { x: 5, z: 5 } }]);
    clock.advance(300);

    const snapshot = boss.snapshot();
    // JSON を通せること (= 関数もクラスインスタンスも入っていないこと) を
    // そのまま検査する。同期を後付けするとき、この型をそのまま送れることが
    // 前提になっている。
    // JSON を通せること (= 関数もクラスインスタンスも入っていないこと) を
    // 検査する。複製そのものは structuredClone で行う。
    expect(JSON.parse(JSON.stringify(snapshot)) as unknown).toEqual(snapshot);
    expect(reserialize(snapshot)).toEqual(snapshot);
  });

  it('予兆の途中で復元しても、同じ時刻に判定が出る', () => {
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;
    const targets: BossTarget[] = [{ id: 'pay', position: { x: 10, z: 0 } }];

    const origin = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    origin.boss.update(targets);
    origin.clock.advance(spec.telegraphMs / 2);

    // 予兆の途中で送る。
    const wire = reserialize(origin.boss.snapshot());

    const replica = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    replica.clock.advance(spec.telegraphMs / 2);
    replica.boss.restore(wire);

    // 復元した側でも、残りの予兆が明けるまでは当たらない。
    replica.clock.advance(spec.telegraphMs / 2 - 1);
    replica.boss.update(targets);
    expect(replica.hits).toHaveLength(0);

    replica.clock.advance(2);
    replica.boss.update(targets);
    expect(replica.hits).toEqual([{ targetId: 'pay', amount: spec.damage }]);
  });

  it('時計の原点が違う相手へ渡しても、予兆の残りが変わらない', () => {
    const spec = DEFAULT_HORI_ATTACKS.WAKE_UP_ALARM;
    const targets: BossTarget[] = [{ id: 'pay', position: { x: 10, z: 0 } }];

    const origin = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    origin.boss.update(targets);
    origin.clock.advance(spec.telegraphMs / 2);

    // 受け取る側は10分前から開いている。performance.now() の原点は
    // ページごとに違うので、絶対時刻をそのまま使うと予兆が何分も明けない。
    const replica = setup({ pickAttack: () => 'WAKE_UP_ALARM' });
    replica.clock.advance(600_000);
    replica.boss.restore(reserialize(origin.boss.snapshot()));

    // 残りの予兆が明けるまでは当たらない。
    replica.clock.advance(spec.telegraphMs / 2 - 1);
    replica.boss.update(targets);
    expect(replica.hits).toHaveLength(0);

    replica.clock.advance(2);
    replica.boss.update(targets);
    expect(replica.hits).toEqual([{ targetId: 'pay', amount: spec.damage }]);
  });

  it('復元した側で危険範囲が同じ形になる', () => {
    const targets: BossTarget[] = [{ id: 'pay', position: { x: 8, z: -3 } }];
    const origin = setup({ pickAttack: () => 'COMPRESSION_FIELD' });
    origin.boss.update(targets);
    origin.clock.advance(400);

    const replica = setup({ pickAttack: () => 'COMPRESSION_FIELD' });
    replica.clock.advance(400);
    replica.boss.restore(reserialize(origin.boss.snapshot()));

    expect(replica.boss.dangerZones(targets)).toEqual(origin.boss.dangerZones(targets));
  });
});
