import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../clock';
import type { InputLockDurations } from '../config/combat-balance';
import { createPlayerInputGate } from './player-input';

function setup(locks?: Partial<InputLockDurations>) {
  const clock = createFakeClock();
  const gate = createPlayerInputGate({ clock, locks });

  return { clock, gate };
}

describe('プレイヤー入力の受付', () => {
  // INPUT-013。「最初の入力のみ採用」を再入力ロックで満たす。
  describe('回避の再入力ロック (約0.7秒)', () => {
    it('受理した直後の再入力は捨てる', () => {
      const { gate } = setup();

      const first = gate.submitDefensive('DODGE_LEFT', true);
      const second = gate.submitDefensive('DODGE_LEFT', true);

      expect(first).toBe('ACCEPTED');
      expect(second).toBe('LOCKED');
    });

    it('ロックが明ける0.7秒の手前と境界で受付が切り替わる', () => {
      const { clock, gate } = setup();

      gate.submitDefensive('DODGE_LEFT', true);
      clock.advance(699);
      const beforeUnlock = gate.submitDefensive('DODGE_RIGHT', true);

      // 弾かれた入力はロックを延長しない。延長すると連打でロックが
      // 明けなくなり、1回の硬直が仕様より長くなる。
      clock.advance(1);
      const atUnlock = gate.submitDefensive('DODGE_RIGHT', true);

      expect(beforeUnlock).toBe('LOCKED');
      expect(atUnlock).toBe('ACCEPTED');
    });
  });

  // INPUT-005 / INPUT-009。受付開始より前の入力。
  describe('早押し (TOO EARLY)', () => {
    it('受付ウィンドウの外の入力は受理せず早押しとして返す', () => {
      const { gate } = setup();

      expect(gate.submitDefensive('GUARD', false)).toBe('TOO_EARLY');
    });

    it('早押しのあとは硬直が明けるまで受付ウィンドウ内でも入力できない', () => {
      const { clock, gate } = setup({ tooEarlyMs: 400 });

      gate.submitDefensive('DODGE_LEFT', false);
      clock.advance(399);
      const duringLock = gate.submitDefensive('DODGE_LEFT', true);

      clock.advance(1);
      const afterLock = gate.submitDefensive('DODGE_LEFT', true);

      expect(duringLock).toBe('LOCKED');
      expect(afterLock).toBe('ACCEPTED');
    });

    it('硬直の長さを設定から変えられる', () => {
      const { clock, gate } = setup({ tooEarlyMs: 300 });

      gate.submitDefensive('DODGE_LEFT', false);
      clock.advance(300);

      expect(gate.submitDefensive('DODGE_LEFT', true)).toBe('ACCEPTED');
    });
  });

  // INPUT-014。反撃可能時間外の攻撃。
  describe('空振り (WHIFF)', () => {
    it('反撃可能時間外の攻撃は空振りになる', () => {
      const { gate } = setup();

      expect(gate.submitAttack(false)).toBe('WHIFF');
    });

    it('空振りのあとは約0.4秒、反撃可能時間内でも攻撃できない', () => {
      const { clock, gate } = setup({ whiffMs: 400 });

      gate.submitAttack(false);
      clock.advance(399);
      const duringLock = gate.submitAttack(true);

      clock.advance(1);
      const afterLock = gate.submitAttack(true);

      expect(duringLock).toBe('LOCKED');
      expect(afterLock).toBe('ACCEPTED');
    });

    it('反撃可能時間内の攻撃は受理する', () => {
      const { gate } = setup();

      expect(gate.submitAttack(true)).toBe('ACCEPTED');
    });

    // COUNTER-006。成功後の連打で反撃が二重に成立しない。
    it('成立した反撃の直後の連打は受理しない', () => {
      const { gate } = setup();

      gate.submitAttack(true);

      expect(gate.submitAttack(true)).toBe('LOCKED');
    });
  });

  // 布団カウンターは「回避成功後0.8秒以内」の攻撃入力
  // (docs/single-player-poc-spec.md §12)。回避の再入力ロック (0.7秒) を
  // 攻撃にも掛けると、カウンターの猶予がほとんど残らず成立しなくなる。
  describe('防御と攻撃のロックの独立', () => {
    it('回避を受理した直後でも反撃の攻撃入力は通る', () => {
      const { clock, gate } = setup();

      gate.submitDefensive('DODGE_LEFT', true);
      clock.advance(300);

      expect(gate.isDefenseLocked()).toBe(true);
      expect(gate.submitAttack(true)).toBe('ACCEPTED');
    });

    it('空振りの硬直は防御入力を塞がない', () => {
      const { gate } = setup();

      gate.submitAttack(false);

      expect(gate.isAttackLocked()).toBe(true);
      expect(gate.submitDefensive('GUARD', true)).toBe('ACCEPTED');
    });
  });

  it('リセットすると硬直が解ける', () => {
    const { gate } = setup();

    gate.submitDefensive('DODGE_LEFT', true);
    gate.submitAttack(false);
    gate.reset();

    expect(gate.isDefenseLocked()).toBe(false);
    expect(gate.isAttackLocked()).toBe(false);
  });
});
