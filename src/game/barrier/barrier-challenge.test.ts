import { describe, expect, it } from 'vitest';

import { DEVICE_ANCHORS } from '../arena/arena';
import type { CharacterId } from '../config/phase2-player-balance';
import type { PlanarPosition } from '../movement/types';
import type { PlayerStatus } from '../player/player-state';
import {
  BARRIER_DEVICE_IDS,
  DEVICE_INTERACT_RANGE,
  createBarrierChallenge,
  type BarrierChallenge,
  type BarrierDeviceId,
  type BarrierParticipant,
} from './barrier-challenge';

function participant(
  characterId: CharacterId,
  position: PlanarPosition,
  status: PlayerStatus = 'ACTIVE',
): BarrierParticipant {
  return { id: characterId.toLowerCase(), characterId, position, status };
}

function positionAt(deviceId: BarrierDeviceId, offset: Partial<PlanarPosition> = {}) {
  const index = BARRIER_DEVICE_IDS.indexOf(deviceId);
  const anchor = DEVICE_ANCHORS[index];
  if (anchor === undefined) throw new Error(`装置 ${deviceId} の anchor が無い`);
  return { x: anchor.x + (offset.x ?? 0), z: anchor.z + (offset.z ?? 0) };
}

function deviceStatus(challenge: BarrierChallenge, deviceId: BarrierDeviceId) {
  return challenge.snapshot().devices.find((device) => device.id === deviceId)?.status;
}

function secureAndActivate(challenge: BarrierChallenge, deviceId: BarrierDeviceId) {
  const secureResult = challenge.submit(participant('ODORUNO', positionAt(deviceId)), {
    type: 'INTERACT',
  });
  const activateResult = challenge.submit(participant('ORA', positionAt(deviceId)), {
    type: 'CHARACTER_ACTION',
  });
  return { secureResult, activateResult };
}

describe('BarrierChallenge', () => {
  it('3台の装置をアンカー順に公開し、共有状態へ正解情報を含めない', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const snapshot = challenge.snapshot();

    expect(BARRIER_DEVICE_IDS).toHaveLength(3);
    expect(DEVICE_ANCHORS).toHaveLength(BARRIER_DEVICE_IDS.length);
    expect(snapshot.devices.map((device) => device.id)).toEqual(BARRIER_DEVICE_IDS);
    expect(snapshot.devices.map((device) => device.status)).toEqual(['IDLE', 'IDLE', 'IDLE']);
    expect(snapshot.nextStepIndex).toBe(0);
    expect(snapshot.securedDeviceId).toBeNull();
    expect(snapshot).not.toHaveProperty('solutionDeviceIds');
    expect(snapshot).not.toHaveProperty('nextDeviceId');
    expect(snapshot.devices.map((device) => device.anchor)).toEqual(
      DEVICE_ANCHORS.map(({ x, z, rotationY }) => ({ x, z, rotationY })),
    );
  });

  it('装置から距離3までは操作でき、3を1e-6超えた操作は状態を変えない', () => {
    const challenge = createBarrierChallenge('BARRIER_1');
    const correctDeviceId = 'DEVICE_1' as const;

    const boundaryResult = challenge.submit(
      participant('ODORUNO', positionAt(correctDeviceId, { x: DEVICE_INTERACT_RANGE, z: 0 })),
      { type: 'INTERACT' },
    );

    expect(boundaryResult.accepted).toBe(true);
    expect(challenge.snapshot().securedDeviceId).toBe(correctDeviceId);

    const beforeOutside = challenge.snapshot();
    const outsideResult = challenge.submit(
      participant('ORA', positionAt(correctDeviceId, { x: DEVICE_INTERACT_RANGE + 1e-6, z: 0 })),
      { type: 'CHARACTER_ACTION' },
    );

    expect(outsideResult).toEqual({ accepted: false, completed: false, reset: false });
    expect(challenge.snapshot()).toEqual(beforeOutside);
  });

  it('PayがACTIVEのときだけ正解列を取得できる', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const activePayView = challenge.viewFor(participant('PAY', positionAt('DEVICE_0')));

    expect(activePayView?.solutionDeviceIds).toEqual(['DEVICE_1']);
    expect(activePayView?.nextDeviceId).toBe('DEVICE_1');
    expect(challenge.viewFor(participant('ODORUNO', positionAt('DEVICE_0')))).toBeNull();
    expect(challenge.viewFor(participant('ORA', positionAt('DEVICE_0')))).toBeNull();
    expect(
      challenge.viewFor(participant('PAY', positionAt('DEVICE_0'), 'FALLING_ASLEEP')),
    ).toBeNull();
    expect(challenge.viewFor(participant('PAY', positionAt('DEVICE_0'), 'ASLEEP'))).toBeNull();
  });

  it('ODORUNOの確保後にORAが起動するとBARRIER_1を完了する', () => {
    const challenge = createBarrierChallenge('BARRIER_1');
    const correctDeviceId = 'DEVICE_1' as const;

    const { secureResult, activateResult } = secureAndActivate(challenge, correctDeviceId);

    expect(secureResult).toEqual({ accepted: true, completed: false, reset: false });
    expect(deviceStatus(challenge, correctDeviceId)).toBe('ACTIVATED');
    expect(activateResult).toEqual({ accepted: true, completed: true, reset: false });
  });

  it('完了後のINTERACTとCHARACTER_ACTIONを無視し状態を維持する', () => {
    const challenge = createBarrierChallenge('BARRIER_1');
    const correctDeviceId = 'DEVICE_1' as const;

    const { activateResult } = secureAndActivate(challenge, correctDeviceId);
    expect(activateResult).toEqual({ accepted: true, completed: true, reset: false });

    const completedSnapshot = challenge.snapshot();
    const interactAfterCompletion = challenge.submit(
      participant('ODORUNO', positionAt(correctDeviceId)),
      { type: 'INTERACT' },
    );
    const actionAfterCompletion = challenge.submit(
      participant('ORA', positionAt(correctDeviceId)),
      { type: 'CHARACTER_ACTION' },
    );

    expect(interactAfterCompletion).toEqual({ accepted: false, completed: false, reset: false });
    expect(actionAfterCompletion).toEqual({ accepted: false, completed: false, reset: false });
    expect(challenge.snapshot()).toEqual(completedSnapshot);
    expect(challenge.snapshot().devices.map((device) => device.status)).toEqual([
      'IDLE',
      'ACTIVATED',
      'IDLE',
    ]);
    expect(deviceStatus(challenge, correctDeviceId)).toBe('ACTIVATED');
    expect(challenge.viewFor(participant('PAY', positionAt('DEVICE_0')))?.nextDeviceId).toBeNull();
  });

  it('snapshotとPay viewは内部状態と共有しない参照を返す', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const firstSnapshot = challenge.snapshot();
    const secondSnapshot = challenge.snapshot();
    const firstPayView = challenge.viewFor(participant('PAY', positionAt('DEVICE_0')));
    const secondPayView = challenge.viewFor(participant('PAY', positionAt('DEVICE_0')));

    if (firstPayView === null || secondPayView === null) throw new Error('Pay view が無い');

    expect(firstSnapshot.devices).not.toBe(secondSnapshot.devices);
    expect(firstSnapshot.devices[0]).not.toBe(secondSnapshot.devices[0]);
    expect(firstSnapshot.devices[0]?.anchor).not.toBe(secondSnapshot.devices[0]?.anchor);
    expect(firstPayView.solutionDeviceIds).not.toBe(secondPayView.solutionDeviceIds);
    expect(firstPayView.solutionDeviceIds).toEqual(secondPayView.solutionDeviceIds);
  });

  it('非ACTIVE・Role不一致・範囲外の入力では進捗をリセットしない', () => {
    const challenge = createBarrierChallenge('BARRIER_1');
    const correctDeviceId = 'DEVICE_1' as const;

    const secureResult = challenge.submit(participant('ODORUNO', positionAt(correctDeviceId)), {
      type: 'INTERACT',
    });
    const beforeIgnoredActions = challenge.snapshot();

    const ignoredActions = [
      challenge.submit(participant('PAY', positionAt(correctDeviceId)), { type: 'INTERACT' }),
      challenge.submit(participant('ORA', positionAt(correctDeviceId)), { type: 'INTERACT' }),
      challenge.submit(participant('ODORUNO', positionAt(correctDeviceId)), {
        type: 'CHARACTER_ACTION',
      }),
      challenge.submit(
        participant('ORA', positionAt(correctDeviceId, { x: DEVICE_INTERACT_RANGE + 1e-6 })),
        { type: 'CHARACTER_ACTION' },
      ),
      challenge.submit(
        participant('ORA', positionAt(correctDeviceId, { x: DEVICE_INTERACT_RANGE }), 'ASLEEP'),
        { type: 'CHARACTER_ACTION' },
      ),
    ];

    expect(secureResult.accepted).toBe(true);
    ignoredActions.forEach((result, index) => {
      expect(result, `無視対象の入力 ${index} が進捗をリセットした`).toEqual({
        accepted: false,
        completed: false,
        reset: false,
      });
    });
    expect(challenge.snapshot()).toEqual(beforeIgnoredActions);
  });

  it('有効Roleが近接範囲内で誤対象を操作したときだけ進捗をリセットする', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const result = challenge.submit(participant('ODORUNO', positionAt('DEVICE_0')), {
      type: 'INTERACT',
    });

    expect(result).toEqual({ accepted: false, completed: false, reset: true });
    expect(challenge.snapshot().devices.map((device) => device.status)).toEqual([
      'IDLE',
      'IDLE',
      'IDLE',
    ]);
    expect(challenge.snapshot().nextStepIndex).toBe(0);
    expect(challenge.snapshot().securedDeviceId).toBeNull();
  });

  it('BARRIER_2の中間成功では起動済み装置を保持し次の装置を待つ', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    const solutionDeviceIds = challenge.viewFor(
      participant('PAY', positionAt('DEVICE_0')),
    )?.solutionDeviceIds;
    if (solutionDeviceIds === undefined) throw new Error('Pay view が無い');

    const firstDeviceId = solutionDeviceIds[0];
    const secondDeviceId = solutionDeviceIds[1];
    if (firstDeviceId === undefined || secondDeviceId === undefined) {
      throw new Error('BARRIER_2の正解列が短い');
    }

    const first = secureAndActivate(challenge, firstDeviceId);

    expect(first.activateResult.completed).toBe(false);
    expect(deviceStatus(challenge, firstDeviceId)).toBe('ACTIVATED');
    expect(challenge.snapshot().nextStepIndex).toBe(1);
    expect(challenge.snapshot().securedDeviceId).toBeNull();
    expect(challenge.viewFor(participant('PAY', positionAt('DEVICE_0')))?.nextDeviceId).toBe(
      secondDeviceId,
    );

    const second = secureAndActivate(challenge, secondDeviceId);

    expect(second.activateResult.completed).toBe(false);
    expect(deviceStatus(challenge, secondDeviceId)).toBe('ACTIVATED');
    expect(challenge.snapshot().nextStepIndex).toBe(2);
    expect(challenge.snapshot().securedDeviceId).toBeNull();
  });

  it('BARRIER_2を正解順で完了し、誤操作後も正解列を変えない', () => {
    const challenge = createBarrierChallenge('BARRIER_2');
    const pay = () => challenge.viewFor(participant('PAY', positionAt('DEVICE_0')));
    const initialSolution = pay()?.solutionDeviceIds;
    if (initialSolution === undefined) throw new Error('Pay view が無い');
    const wrongOrderDeviceId = initialSolution[1];
    if (wrongOrderDeviceId === undefined) throw new Error('BARRIER_2の正解列が短い');

    const wrongOrderResult = challenge.submit(
      participant('ODORUNO', positionAt(wrongOrderDeviceId)),
      { type: 'INTERACT' },
    );

    expect(wrongOrderResult.reset).toBe(true);
    expect(pay()?.solutionDeviceIds).toEqual(initialSolution);

    for (const [index, deviceId] of initialSolution.entries()) {
      const result = secureAndActivate(challenge, deviceId);
      expect(result.activateResult.completed).toBe(index === initialSolution.length - 1);
    }

    expect(challenge.snapshot().nextStepIndex).toBe(initialSolution.length);
    expect(challenge.snapshot().devices.every((device) => device.status === 'ACTIVATED')).toBe(
      true,
    );
  });

  it('FALLING_ASLEEPのORAは蘇生後に同じ確保状態から再開できる', () => {
    const challenge = createBarrierChallenge('BARRIER_1');
    const correctDeviceId = 'DEVICE_1' as const;

    challenge.submit(participant('ODORUNO', positionAt(correctDeviceId)), { type: 'INTERACT' });
    const beforeFallingAsleep = challenge.snapshot();

    const asleepResult = challenge.submit(
      participant('ORA', positionAt(correctDeviceId), 'FALLING_ASLEEP'),
      { type: 'CHARACTER_ACTION' },
    );

    expect(asleepResult).toEqual({ accepted: false, completed: false, reset: false });
    expect(challenge.snapshot()).toEqual(beforeFallingAsleep);

    const resumedResult = challenge.submit(
      participant('ORA', positionAt(correctDeviceId), 'ACTIVE'),
      { type: 'CHARACTER_ACTION' },
    );

    expect(resumedResult.completed).toBe(true);
    expect(deviceStatus(challenge, correctDeviceId)).toBe('ACTIVATED');
  });
});
