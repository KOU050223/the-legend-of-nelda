import { describe, expect, it } from 'vitest';

import { COMBO_STEPS } from '@/game/config/phase2-player-balance';
import type { PlayerSnapshot } from '@/game/player/player-state';
import type { BossSnapshot } from '@/game/boss/hori-boss';

import { MOTION_MODELS, resolveClip } from './motion-manifest';
import { bossMotionContextFor, isSameMotionContext, motionContextFor } from './motion-context';

const FIRST_STEP = COMBO_STEPS[0] ?? { windupMs: 0, activeMs: 0, recoverMs: 0, damageScale: 1 };
const SWING_MS = FIRST_STEP.windupMs + FIRST_STEP.activeMs + FIRST_STEP.recoverMs;

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'p1',
    characterId: 'ORA',
    status: 'ACTIVE',
    hp: 100,
    hpMax: 100,
    position: { x: 0, z: 0 },
    rotationY: 0,
    swing: null,
    invulnerableUntil: null,
    dodgeReadyAt: 0,
    sleepAt: null,
    reviveInputs: 0,
    lastReviveAt: null,
    moveInput: { forward: 0, right: 0 },
    takenAt: 0,
    ...overrides,
  };
}

function bossSnapshot(overrides: Partial<BossSnapshot> = {}): BossSnapshot {
  return {
    hp: 100,
    hpMax: 100,
    phase: 'INTRO',
    position: { x: 2, z: 0 },
    rotationY: 0,
    attackCount: 0,
    activeAttack: null,
    bossDownUntil: null,
    nextAttackAt: 0,
    takenAt: 1000,
    ...overrides,
  };
}

describe('プレイヤーの状態からモーションの条件を作る', () => {
  it('何もしていなければどの条件も立たない', () => {
    const context = motionContextFor(snapshot(), 1000);

    expect(context.attacking).toBe(false);
    expect(context.fallingAsleep).toBe(false);
    expect(context.asleep).toBe(false);
  });

  it('振っている最中は attacking が立つ', () => {
    const player = snapshot({ swing: { stepIndex: 0, startedAt: 1000, hasHit: false } });

    expect(motionContextFor(player, 1000).attacking).toBe(true);
  });

  /**
   * `swing` は振り終わっても連撃の猶予のあいだ残る。null かどうかで見ると
   * 攻撃モーションが猶予のあいだ流れ続けるため、局面で見る。
   */
  it('振り終えた swing が残っていても attacking は立たない', () => {
    const player = snapshot({ swing: { stepIndex: 0, startedAt: 1000, hasHit: true } });

    expect(motionContextFor(player, 1000 + SWING_MS + 1).attacking).toBe(false);
  });

  it('寝落ちかけ・就寝はそのまま条件になる', () => {
    expect(motionContextFor(snapshot({ status: 'FALLING_ASLEEP' }), 0).fallingAsleep).toBe(true);
    expect(motionContextFor(snapshot({ status: 'ASLEEP' }), 0).asleep).toBe(true);
  });

  it('前フレームから位置が変わると moving が立つ', () => {
    const player = snapshot({ position: { x: 2, z: 0 } });

    expect(motionContextFor(player, 1000, { x: 1, z: 0 }).moving).toBe(true);
    expect(motionContextFor(player, 1000, player.position).moving).toBe(false);
  });

  it('移動入力を保持している間は位置差分がなくても moving が立つ', () => {
    const player = snapshot({ moveInput: { forward: 1, right: 0 } });

    expect(motionContextFor(player, 1000, player.position).moving).toBe(true);
  });

  it('回避中は dodging が立つ', () => {
    const player = snapshot({ invulnerableUntil: 1100 });

    expect(motionContextFor(player, 1000).dodging).toBe(true);
    expect(motionContextFor(player, 1100).dodging).toBe(false);
  });
});

describe('ボスの状態からモーションの条件を作る', () => {
  it('前フレームから位置が変わると moving が立つ', () => {
    expect(bossMotionContextFor(bossSnapshot(), 1000, { x: 1, z: 0 }).moving).toBe(true);
    expect(bossMotionContextFor(bossSnapshot(), 1000, { x: 2, z: 0 }).moving).toBe(false);
  });

  it('進行中の攻撃があると attacking が立つ', () => {
    expect(
      bossMotionContextFor(
        bossSnapshot({
          activeAttack: {
            attackId: 'WAKE_UP_ALARM',
            startedAt: 1000,
            timing: { telegraphMs: 100, activeMs: 200, recoverMs: 100, damage: 0 },
            aim: { origin: { x: 0, z: 0 }, rotationY: 0, points: [] },
            hitTargetIds: [],
            beamOrigin: null,
            resolvedDuringActive: false,
          },
        }),
        1000,
      ).attacking,
    ).toBe(true);
  });
});

describe('条件が同じかの比較', () => {
  /**
   * 再レンダーは「モーションが変わるとき」だけに絞る。同じ局面の中で
   * 時刻が進んだだけでは作り直さない (BossArenaScene の isSameView と同じ規律)。
   */
  it('同じ局面の中で時刻が進んだだけなら同じ扱い', () => {
    const player = snapshot({ swing: { stepIndex: 0, startedAt: 1000, hasHit: false } });

    const before = motionContextFor(player, 1000);
    const after = motionContextFor(player, 1000 + FIRST_STEP.windupMs);

    expect(isSameMotionContext(before, after)).toBe(true);
  });

  it('振り終わると別の扱いになる', () => {
    const player = snapshot({ swing: { stepIndex: 0, startedAt: 1000, hasHit: true } });

    const swinging = motionContextFor(player, 1000);
    const done = motionContextFor(player, 1000 + SWING_MS + 1);

    expect(isSameMotionContext(swinging, done)).toBe(false);
  });
});

/**
 * ゲーム中の配線。プレイヤーの状態から、実際に再生されるクリップまで繋がって
 * いることを確かめる。`CharacterActor` はここで作った条件をそのまま
 * `CharacterModel` へ渡し、`useMotionClip` がクリップを引く。
 */
describe('状態から再生クリップまで', () => {
  const ora = MOTION_MODELS['star-platinum'];

  it('オラ大輔が振っている間は攻撃クリップになる', () => {
    const player = snapshot({ swing: { stepIndex: 0, startedAt: 1000, hasHit: false } });

    expect(resolveClip(ora, motionContextFor(player, 1000))).toBe('punch');
  });

  it('振っていなければ待機クリップへ戻る', () => {
    expect(resolveClip(ora, motionContextFor(snapshot(), 1000))).toBe('idle');
  });

  it('オドルノが振っている間は攻撃クリップになる', () => {
    const dance = MOTION_MODELS['dance-daisuke'];
    const player = snapshot({ swing: { stepIndex: 0, startedAt: 1000, hasHit: false } });

    expect(resolveClip(dance, motionContextFor(player, 1000))).toBe('punch');
  });

  it('歩行中は歩行クリップになる', () => {
    const dance = MOTION_MODELS['dance-daisuke'];
    const player = snapshot({ position: { x: 1, z: 0 } });

    expect(resolveClip(dance, motionContextFor(player, 1000, { x: 0, z: 0 }))).toBe('walk');
  });
});
