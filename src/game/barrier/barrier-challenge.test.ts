import { describe, expect, it } from 'vitest';

import { DEVICE_ANCHORS } from '../arena/arena';
import type { CharacterId } from '../config/phase2-player-balance';
import type { PlanarPosition } from '../movement/types';
import type { PlayerStatus } from '../player/player-state';
import {
  BARRIER_DEVICE_IDS,
  DEVICE_INTERACT_RANGE,
  createBarrierChallenge,
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

function positionAt(
  deviceId: BarrierDeviceId,
  offset: Partial<PlanarPosition> = {},
): PlanarPosition {
  const anchor = DEVICE_ANCHORS[BARRIER_DEVICE_IDS.indexOf(deviceId)];
  if (anchor === undefined) throw new Error(`装置 ${deviceId} の anchor が無い`);
  return { x: anchor.x + (offset.x ?? 0), z: anchor.z + (offset.z ?? 0) };
}

/** 3人がそれぞれ別のサークルへ入った状態。 */
function everyoneInside(): BarrierParticipant[] {
  return [
    participant('ODORUNO', positionAt('DEVICE_0')),
    participant('PAY', positionAt('DEVICE_1')),
    participant('ORA', positionAt('DEVICE_2')),
  ];
}

describe('createBarrierChallenge', () => {
  it('3人が別々のサークルへ入ると解除される', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    expect(challenge.evaluate(everyoneInside()).completed).toBe(true);
  });

  it('誰がどのサークルでもよい (順番を問わない)', () => {
    const challenge = createBarrierChallenge('BARRIER_2');

    const shuffled = [
      participant('ORA', positionAt('DEVICE_0')),
      participant('ODORUNO', positionAt('DEVICE_2')),
      participant('PAY', positionAt('DEVICE_1')),
    ];

    expect(challenge.evaluate(shuffled).completed).toBe(true);
  });

  it('2人までしか入っていなければ解除されない', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const result = challenge.evaluate([
      participant('ODORUNO', positionAt('DEVICE_0')),
      participant('PAY', positionAt('DEVICE_1')),
      participant('ORA', { x: 0, z: 0 }),
    ]);

    expect(result.completed).toBe(false);
    expect(challenge.snapshot().occupiedCount).toBe(2);
  });

  it('サークルの境界は中に入っていると見なす', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const onEdge = [
      participant('ODORUNO', positionAt('DEVICE_0', { x: DEVICE_INTERACT_RANGE })),
      participant('PAY', positionAt('DEVICE_1')),
      participant('ORA', positionAt('DEVICE_2')),
    ];

    expect(challenge.evaluate(onEdge).completed).toBe(true);
  });

  it('サークルの外に出ると、その分の埋まりが戻る', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    challenge.evaluate([
      participant('ODORUNO', positionAt('DEVICE_0')),
      participant('PAY', positionAt('DEVICE_1')),
      participant('ORA', { x: 0, z: 0 }),
    ]);
    expect(challenge.snapshot().occupiedCount).toBe(2);

    challenge.evaluate([
      participant('ODORUNO', positionAt('DEVICE_0')),
      participant('PAY', { x: 0, z: 0 }),
      participant('ORA', { x: 0, z: 0 }),
    ]);
    expect(challenge.snapshot().occupiedCount).toBe(1);
  });

  it('寝ている人はサークルを埋められない', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    const result = challenge.evaluate([
      participant('ODORUNO', positionAt('DEVICE_0')),
      participant('PAY', positionAt('DEVICE_1')),
      participant('ORA', positionAt('DEVICE_2'), 'ASLEEP'),
    ]);

    expect(result.completed).toBe(false);
    expect(challenge.snapshot().occupiedCount).toBe(2);
  });

  it('一度解除したら、そのあとは解除を繰り返さない', () => {
    const challenge = createBarrierChallenge('BARRIER_1');

    expect(challenge.evaluate(everyoneInside()).completed).toBe(true);
    expect(challenge.evaluate(everyoneInside()).completed).toBe(false);
  });

  it('結界フェーズ以外では作れない', () => {
    // @ts-expect-error 結界フェーズ以外を渡せないことを型でも守っている。
    expect(() => createBarrierChallenge('INTRO')).toThrow(RangeError);
  });

  it('スナップショットは装置の位置と状態を持つ', () => {
    const challenge = createBarrierChallenge('BARRIER_1');
    challenge.evaluate([participant('ODORUNO', positionAt('DEVICE_0'))]);

    const snapshot = challenge.snapshot();
    expect(snapshot.phase).toBe('BARRIER_1');
    expect(snapshot.devices.map((device) => device.id)).toEqual([...BARRIER_DEVICE_IDS]);
    expect(snapshot.devices[0]?.status).toBe('OCCUPIED');
    expect(snapshot.devices[1]?.status).toBe('IDLE');
  });
});
