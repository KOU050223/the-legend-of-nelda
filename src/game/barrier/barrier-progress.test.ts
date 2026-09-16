import { describe, expect, it } from 'vitest';

import { DEVICE_ANCHORS } from '../arena/arena';
import type { CharacterId } from '../config/phase2-player-balance';
import type { PlanarPosition } from '../movement/types';
import {
  BARRIER_DEVICE_IDS,
  createBarrierChallenge,
  type BarrierChallenge,
  type BarrierDeviceId,
  type BarrierParticipant,
} from './barrier-challenge';
import { didResetProgress } from './barrier-progress';

function participant(characterId: CharacterId, position: PlanarPosition): BarrierParticipant {
  return { id: characterId.toLowerCase(), characterId, position, status: 'ACTIVE' };
}

function positionAt(deviceId: BarrierDeviceId): PlanarPosition {
  const anchor = DEVICE_ANCHORS[BARRIER_DEVICE_IDS.indexOf(deviceId)];
  if (anchor === undefined) throw new Error(`装置 ${deviceId} の anchor が無い`);
  return { x: anchor.x, z: anchor.z };
}

function secure(challenge: BarrierChallenge, deviceId: BarrierDeviceId) {
  return challenge.submit(participant('ODORUNO', positionAt(deviceId)), { type: 'INTERACT' });
}

function activate(challenge: BarrierChallenge, deviceId: BarrierDeviceId) {
  return challenge.submit(participant('ORA', positionAt(deviceId)), {
    type: 'CHARACTER_ACTION',
  });
}

describe('didResetProgress', () => {
  it('確保済みの装置がある状態から巻き戻ると、間違えたと読む', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    // BARRIER_2 の正解列は DEVICE_2 → DEVICE_0 → DEVICE_1。
    secure(challenge, 'DEVICE_2');
    const before = challenge.snapshot();

    // 確保中に別の装置へ触れると resetProgress() が走る。
    const result = secure(challenge, 'DEVICE_0');
    expect(result.reset).toBe(true);

    expect(didResetProgress(before, challenge.snapshot())).toBe(true);
  });

  it('1台起動済みの状態から巻き戻ると、間違えたと読む', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    secure(challenge, 'DEVICE_2');
    activate(challenge, 'DEVICE_2');
    const before = challenge.snapshot();
    expect(before.nextStepIndex).toBe(1);

    // 次は DEVICE_0 が正解。違う装置へ触れると巻き戻る。
    expect(secure(challenge, 'DEVICE_1').reset).toBe(true);

    expect(didResetProgress(before, challenge.snapshot())).toBe(true);
  });

  it('正しく進んでいる間は巻き戻しと読まない', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    const before = challenge.snapshot();
    secure(challenge, 'DEVICE_2');

    expect(didResetProgress(before, challenge.snapshot())).toBe(false);
  });

  it('進行が無い状態のままでは巻き戻しと読まない', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    const before = challenge.snapshot();

    // 圏外での操作は無視され、状態が動かない。
    challenge.submit(participant('ODORUNO', { x: 0, z: 0 }), { type: 'INTERACT' });

    expect(didResetProgress(before, challenge.snapshot())).toBe(false);
  });

  it('別のフェーズへ張り替わったときは巻き戻しと読まない', () => {
    const first = createBarrierChallenge('BARRIER_1');
    secure(first, 'DEVICE_1');
    const second = createBarrierChallenge('BARRIER_2');

    expect(didResetProgress(first.snapshot(), second.snapshot())).toBe(false);
  });

  it('結界が無い側が null のときは巻き戻しと読まない', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    secure(challenge, 'DEVICE_2');

    expect(didResetProgress(challenge.snapshot(), null)).toBe(false);
    expect(didResetProgress(null, challenge.snapshot())).toBe(false);
  });
});
