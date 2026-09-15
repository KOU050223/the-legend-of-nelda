import { DEVICE_ANCHORS, type ArenaAnchor } from '../arena/arena';
import { isBarrierPhase, type BossPhase } from '../boss/boss-phase';
import type { CharacterId } from '../config/phase2-player-balance';
import type { PlanarPosition } from '../movement/types';
import type { PlayerStatus } from '../player/player-state';
import type { GameAction } from '../types/game-action';

export type BarrierPhase = Extract<BossPhase, 'BARRIER_1' | 'BARRIER_2'>;

export const BARRIER_DEVICE_IDS = ['DEVICE_0', 'DEVICE_1', 'DEVICE_2'] as const;
export type BarrierDeviceId = (typeof BARRIER_DEVICE_IDS)[number];
export type BarrierDeviceStatus = 'IDLE' | 'SECURED' | 'ACTIVATED';

/** 結界装置の操作を受け付ける平面距離。境界値は有効とする。 */
export const DEVICE_INTERACT_RANGE = 3;

export interface BarrierParticipant {
  readonly id: string;
  readonly characterId: CharacterId;
  readonly status: PlayerStatus;
  readonly position: PlanarPosition;
}

type BarrierActionType = Extract<GameAction['type'], 'INTERACT' | 'CHARACTER_ACTION'>;

export type BarrierAction = { readonly type: BarrierActionType };

export interface BarrierActionResult {
  readonly accepted: boolean;
  readonly completed: boolean;
  readonly reset: boolean;
}

export interface BarrierDeviceSnapshot {
  readonly id: BarrierDeviceId;
  readonly anchor: ArenaAnchor;
  readonly status: BarrierDeviceStatus;
}

export interface BarrierChallengeSnapshot {
  readonly phase: BarrierPhase;
  readonly devices: readonly BarrierDeviceSnapshot[];
  readonly nextStepIndex: number;
  readonly securedDeviceId: BarrierDeviceId | null;
}

export interface BarrierPayView extends BarrierChallengeSnapshot {
  readonly solutionDeviceIds: readonly BarrierDeviceId[];
  readonly nextDeviceId: BarrierDeviceId | null;
}

export interface BarrierChallenge {
  submit(participant: BarrierParticipant, action: BarrierAction): BarrierActionResult;
  snapshot(): BarrierChallengeSnapshot;
  viewFor(participant: BarrierParticipant): BarrierPayView | null;
}

export function isBarrierAction(action: GameAction): action is BarrierAction {
  return action.type === 'INTERACT' || action.type === 'CHARACTER_ACTION';
}

interface MutableBarrierDevice {
  readonly id: BarrierDeviceId;
  readonly anchor: ArenaAnchor;
  status: BarrierDeviceStatus;
}

const IGNORED_RESULT: BarrierActionResult = {
  accepted: false,
  completed: false,
  reset: false,
};

const RESET_RESULT: BarrierActionResult = {
  accepted: false,
  completed: false,
  reset: true,
};

function solutionFor(phase: BarrierPhase): readonly BarrierDeviceId[] {
  return phase === 'BARRIER_1' ? ['DEVICE_1'] : ['DEVICE_2', 'DEVICE_0', 'DEVICE_1'];
}

function copyAnchor(anchor: ArenaAnchor): ArenaAnchor {
  return { ...anchor };
}

function createDevices(): MutableBarrierDevice[] {
  if (DEVICE_ANCHORS.length !== BARRIER_DEVICE_IDS.length) {
    throw new RangeError('DEVICE_ANCHORS と BARRIER_DEVICE_IDS の台数が一致しません');
  }

  return DEVICE_ANCHORS.map((anchor, index) => {
    const id = BARRIER_DEVICE_IDS[index];
    if (id === undefined) {
      throw new RangeError(`装置 ID がありません: index=${index}`);
    }
    return { id, anchor: copyAnchor(anchor), status: 'IDLE' };
  });
}

function validateSolution(
  phase: BarrierPhase,
  solutionDeviceIds: readonly BarrierDeviceId[],
): void {
  if (phase === 'BARRIER_1' && solutionDeviceIds.length !== 1) {
    throw new RangeError('BARRIER_1 の正解列は1台でなければなりません');
  }
  if (phase !== 'BARRIER_2') return;

  if (solutionDeviceIds.length !== BARRIER_DEVICE_IDS.length) {
    throw new RangeError('BARRIER_2 の正解列は3台でなければなりません');
  }
  if (new Set(solutionDeviceIds).size !== solutionDeviceIds.length) {
    throw new RangeError('BARRIER_2 の正解列に重複があります');
  }
}

function isBarrierActionForCharacter(
  participant: BarrierParticipant,
  action: BarrierAction,
): boolean {
  return (
    (participant.characterId === 'ODORUNO' && action.type === 'INTERACT') ||
    (participant.characterId === 'ORA' && action.type === 'CHARACTER_ACTION')
  );
}

export function createBarrierChallenge(phase: BarrierPhase): BarrierChallenge {
  if (!isBarrierPhase(phase)) {
    throw new RangeError('結界フェーズではありません');
  }

  const devices = createDevices();
  const solutionDeviceIds = [...solutionFor(phase)];
  validateSolution(phase, solutionDeviceIds);

  let nextStepIndex = 0;
  let securedDeviceId: BarrierDeviceId | null = null;
  let completed = false;

  function resetProgress(): void {
    for (const device of devices) device.status = 'IDLE';
    nextStepIndex = 0;
    securedDeviceId = null;
  }

  function nearestDeviceId(position: PlanarPosition): BarrierDeviceId | null {
    let nearest: BarrierDeviceId | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const device of devices) {
      const distance = Math.hypot(device.anchor.x - position.x, device.anchor.z - position.z);
      if (distance > DEVICE_INTERACT_RANGE || distance >= nearestDistance) continue;
      nearest = device.id;
      nearestDistance = distance;
    }

    return nearest;
  }

  function deviceById(id: BarrierDeviceId): MutableBarrierDevice {
    const device = devices.find((candidate) => candidate.id === id);
    if (device === undefined) throw new Error(`装置がありません: ${id}`);
    return device;
  }

  function snapshot(): BarrierChallengeSnapshot {
    return {
      phase,
      devices: devices.map((device) => ({
        id: device.id,
        anchor: copyAnchor(device.anchor),
        status: device.status,
      })),
      nextStepIndex,
      securedDeviceId,
    };
  }

  return {
    submit(participant, action) {
      if (completed || participant.status !== 'ACTIVE') return IGNORED_RESULT;
      if (!isBarrierActionForCharacter(participant, action)) return IGNORED_RESULT;

      const nearbyDeviceId = nearestDeviceId(participant.position);
      if (nearbyDeviceId === null) return IGNORED_RESULT;

      const expectedDeviceId = solutionDeviceIds[nextStepIndex];
      if (expectedDeviceId === undefined) return IGNORED_RESULT;

      if (action.type === 'INTERACT') {
        const device = deviceById(nearbyDeviceId);
        if (
          nearbyDeviceId !== expectedDeviceId ||
          securedDeviceId !== null ||
          device.status !== 'IDLE'
        ) {
          resetProgress();
          return RESET_RESULT;
        }

        device.status = 'SECURED';
        securedDeviceId = device.id;
        return { accepted: true, completed: false, reset: false };
      }

      const device = deviceById(nearbyDeviceId);
      if (
        nearbyDeviceId !== expectedDeviceId ||
        securedDeviceId !== expectedDeviceId ||
        device.status !== 'SECURED'
      ) {
        resetProgress();
        return RESET_RESULT;
      }

      device.status = 'ACTIVATED';
      securedDeviceId = null;
      nextStepIndex += 1;

      if (nextStepIndex >= solutionDeviceIds.length) {
        completed = true;
        return { accepted: true, completed: true, reset: false };
      }

      return { accepted: true, completed: false, reset: false };
    },

    snapshot,

    viewFor(participant) {
      if (participant.status !== 'ACTIVE' || participant.characterId !== 'PAY') return null;

      return {
        ...snapshot(),
        solutionDeviceIds: [...solutionDeviceIds],
        nextDeviceId: solutionDeviceIds[nextStepIndex] ?? null,
      };
    },
  };
}
