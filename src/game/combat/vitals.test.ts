import { describe, expect, it, vi } from 'vitest';

import { createGameEventBus, type GameEvent } from '../events/game-event';
import { createCombatVitals } from './vitals';

/** 発行されたイベントを順に集める。購読側から見た値の変化を確認する。 */
function withRecordedEvents() {
  const eventBus = createGameEventBus();
  const events: GameEvent[] = [];

  eventBus.subscribe((event) => events.push(event));

  return { eventBus, events };
}

describe('createCombatVitals', () => {
  describe('初期値 (docs/tests/phase1-single-player-test-spec.md §6)', () => {
    // HP-001
    it('ボスHPは100から始まる', () => {
      expect(createCombatVitals().bossHp).toBe(100);
    });

    it('SLEEPINESSは0から始まる', () => {
      expect(createCombatVitals().sleepiness).toBe(0);
    });
  });

  describe('反撃ダメージ (docs/single-player-poc-spec.md §5)', () => {
    // HP-002 / HP-003 / HP-004
    it.each([
      { attackId: 'PILLOW_SWEEP', name: '枕薙ぎ払い', expected: 90 },
      { attackId: 'YAWN_WAVE', name: 'あくび衝撃波', expected: 85 },
      { attackId: 'FLUFFY_FUTON', name: 'ふかふか布団', expected: 70 },
    ] as const)('$name の反撃が成功するとボスHPは $expected になる', ({ attackId, expected }) => {
      const vitals = createCombatVitals();

      vitals.applyCounterDamage(attackId);

      expect(vitals.bossHp).toBe(expected);
    });

    it('反撃を重ねるとボスHPが累積で減る', () => {
      const vitals = createCombatVitals();

      vitals.applyCounterDamage('PILLOW_SWEEP');
      vitals.applyCounterDamage('YAWN_WAVE');

      expect(vitals.bossHp).toBe(75);
    });
  });

  describe('被弾時のSLEEPINESS増加 (docs/single-player-poc-spec.md §4)', () => {
    // PILLOW-010 / YAWN-010 / FUTON-009 が要求する「設定値が1回だけ加算される」。
    // 数値そのものは仕様が幅を持つため config 側で調整できる。
    it.each([
      { attackId: 'PILLOW_SWEEP', name: '枕薙ぎ払い', expected: 12 },
      { attackId: 'YAWN_WAVE', name: 'あくび衝撃波', expected: 18 },
      { attackId: 'FLUFFY_FUTON', name: 'ふかふか布団', expected: 28 },
    ] as const)('$name に被弾するとSLEEPINESSが $expected になる', ({ attackId, expected }) => {
      const vitals = createCombatVitals();

      vitals.applyAttackSleepiness(attackId);

      expect(vitals.sleepiness).toBe(expected);
    });
  });

  describe('上限・下限のClamp', () => {
    // HP-005
    it('残りHPより大きいダメージを与えてもボスHPは0を下回らない', () => {
      const vitals = createCombatVitals({ initialBossHp: 5 });

      vitals.damageBoss(30);

      expect(vitals.bossHp).toBe(0);
    });

    // HP-008
    it('上限を超えるSLEEPINESSを受けても100を超えない', () => {
      const vitals = createCombatVitals();

      vitals.addSleepiness(80);
      vitals.addSleepiness(80);

      expect(vitals.sleepiness).toBe(100);
    });

    // Issue #5 の完了条件は「増減できる」なので、負値を渡す呼び出しが下流に現れうる。
    // 片側しかClampしていないと初期HP超や負の眠気が生まれる。
    it('回復させてもボスHPは初期値を超えない', () => {
      const vitals = createCombatVitals();

      vitals.damageBoss(10);
      vitals.damageBoss(-50);

      expect(vitals.bossHp).toBe(100);
    });

    it('眠気を減らしても0を下回らない', () => {
      const vitals = createCombatVitals();

      vitals.addSleepiness(10);
      vitals.addSleepiness(-50);

      expect(vitals.sleepiness).toBe(0);
    });
  });

  // #4 / #6 の攻撃ハンドラへ関数だけを渡す使い方を壊さないための固定。
  describe('メソッドを関数として取り出しても動く', () => {
    it('分割代入した関数でもボスHPへダメージが入る', () => {
      const vitals = createCombatVitals();
      const { applyCounterDamage } = vitals;

      applyCounterDamage('PILLOW_SWEEP');

      expect(vitals.bossHp).toBe(90);
    });

    it('分割代入した関数でもSLEEPINESSが増える', () => {
      const vitals = createCombatVitals();
      const { applyAttackSleepiness } = vitals;

      applyAttackSleepiness('YAWN_WAVE');

      expect(vitals.sleepiness).toBe(18);
    });
  });

  describe('勝敗の通知', () => {
    it('戦闘中は終了状態を返さない', () => {
      expect(createCombatVitals().resolveBattleEnd()).toBeNull();
    });

    // HP-005 / SM-003 / RESULT-001
    it('ボスHPが0になると勝利を通知する', () => {
      const vitals = createCombatVitals({ initialBossHp: 1 });

      vitals.damageBoss(1);

      expect(vitals.resolveBattleEnd()).toBe('BOSS_DEFEATED');
    });

    // HP-006 / SM-004 / RESULT-003
    it('SLEEPINESSが100へ達すると敗北を通知する', () => {
      const vitals = createCombatVitals();

      vitals.addSleepiness(99);
      vitals.addSleepiness(1);

      expect(vitals.resolveBattleEnd()).toBe('PLAYER_LOSE');
    });

    // HP-007
    it('SLEEPINESSが99では敗北しない', () => {
      const vitals = createCombatVitals();

      vitals.addSleepiness(98);
      vitals.addSleepiness(1);

      expect(vitals.sleepiness).toBe(99);
      expect(vitals.resolveBattleEnd()).toBeNull();
    });

    // RESULT-004 / RESULT-005。問い合わせ型なので何度読んでも同じ答えを返し、
    // 「勝敗イベントが複数回発火する」状態が起きない。
    it('決着後に何度問い合わせても同じ終了状態を返す', () => {
      const vitals = createCombatVitals({ initialBossHp: 1 });

      vitals.damageBoss(1);
      vitals.damageBoss(30);

      expect(vitals.resolveBattleEnd()).toBe('BOSS_DEFEATED');
      expect(vitals.resolveBattleEnd()).toBe('BOSS_DEFEATED');
    });

    // HPが0かつSLEEPINESSが100という相打ちは、反撃が成立している側を採る。
    it('HP0とSLEEPINESS100が同時に成立したら勝利を優先する', () => {
      const vitals = createCombatVitals({ initialBossHp: 10 });

      vitals.addSleepiness(100);
      vitals.damageBoss(10);

      expect(vitals.resolveBattleEnd()).toBe('BOSS_DEFEATED');
    });
  });

  describe('値変更の購読 (docs/technical-design.md §6)', () => {
    it('ボスHPが減ると購読側へ変更後の値が届く', () => {
      const { eventBus, events } = withRecordedEvents();
      const vitals = createCombatVitals({ eventBus });

      vitals.applyCounterDamage('PILLOW_SWEEP');

      expect(events).toEqual([{ type: 'BOSS_HP_CHANGED', hp: 90 }]);
    });

    it('SLEEPINESSが増えると購読側へ変更後の値が届く', () => {
      const { eventBus, events } = withRecordedEvents();
      const vitals = createCombatVitals({ eventBus });

      vitals.applyAttackSleepiness('YAWN_WAVE');

      expect(events).toEqual([{ type: 'SLEEPINESS_CHANGED', value: 18 }]);
    });

    // Clamp済みの値へさらにダメージが入っても、購読側の演出が
    // 変化していない値で再生されないようにする。
    it('Clampされて値が動かない場合は通知しない', () => {
      const { eventBus, events } = withRecordedEvents();
      const vitals = createCombatVitals({ eventBus, initialBossHp: 5 });

      vitals.damageBoss(30);
      vitals.damageBoss(30);

      expect(events).toEqual([{ type: 'BOSS_HP_CHANGED', hp: 0 }]);
    });

    it('購読を解除した後は通知が届かない', () => {
      const eventBus = createGameEventBus();
      const listener = vi.fn<(event: GameEvent) => void>();
      const vitals = createCombatVitals({ eventBus });

      eventBus.subscribe(listener)();
      vitals.damageBoss(10);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('ダメージ量の設定 (Issue #5「設定から変更できる」)', () => {
    it('技ごとの反撃ダメージを設定で上書きできる', () => {
      const vitals = createCombatVitals({
        attackDamage: { PILLOW_SWEEP: { bossDamage: 25 } },
      });

      vitals.applyCounterDamage('PILLOW_SWEEP');

      expect(vitals.bossHp).toBe(75);
    });

    it('技ごとのSLEEPINESS増加量を設定で上書きできる', () => {
      const vitals = createCombatVitals({
        attackDamage: { FLUFFY_FUTON: { sleepinessDamage: 50 } },
      });

      vitals.applyAttackSleepiness('FLUFFY_FUTON');

      expect(vitals.sleepiness).toBe(50);
    });

    it('上書きしなかった技は既定値のまま残る', () => {
      const vitals = createCombatVitals({
        attackDamage: { PILLOW_SWEEP: { bossDamage: 25 } },
      });

      vitals.applyCounterDamage('YAWN_WAVE');

      expect(vitals.bossHp).toBe(85);
    });

    it('SLEEPINESSの上限を設定で変更できる', () => {
      const vitals = createCombatVitals({ maxSleepiness: 50 });

      vitals.addSleepiness(50);

      expect(vitals.resolveBattleEnd()).toBe('PLAYER_LOSE');
    });
  });

  // RESULT-008
  describe('リスタート', () => {
    it('reset するとHPとSLEEPINESSが初期値へ戻る', () => {
      const vitals = createCombatVitals();

      vitals.applyCounterDamage('FLUFFY_FUTON');
      vitals.applyAttackSleepiness('FLUFFY_FUTON');
      vitals.reset();

      expect(vitals.bossHp).toBe(100);
      expect(vitals.sleepiness).toBe(0);
      expect(vitals.resolveBattleEnd()).toBeNull();
    });

    it('reset の結果も購読側へ通知される', () => {
      const { eventBus, events } = withRecordedEvents();
      const vitals = createCombatVitals({ eventBus });

      vitals.applyCounterDamage('PILLOW_SWEEP');
      vitals.reset();

      expect(events).toEqual([
        { type: 'BOSS_HP_CHANGED', hp: 90 },
        { type: 'BOSS_HP_CHANGED', hp: 100 },
      ]);
    });
  });
});
