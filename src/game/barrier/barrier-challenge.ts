import { DEVICE_ANCHORS, type ArenaAnchor } from '../arena/arena';
import { isBarrierPhase, type BossPhase } from '../boss/boss-phase';
import type { CharacterId } from '../config/phase2-player-balance';
import type { PlanarPosition } from '../movement/types';
import type { PlayerStatus } from '../player/player-state';

export type BarrierPhase = Extract<BossPhase, 'BARRIER_1' | 'BARRIER_2'>;

export const BARRIER_DEVICE_IDS = ['DEVICE_0', 'DEVICE_1', 'DEVICE_2'] as const;
export type BarrierDeviceId = (typeof BARRIER_DEVICE_IDS)[number];

/** 装置のサークル。空か、誰かが入っているか。 */
export type BarrierDeviceStatus = 'IDLE' | 'OCCUPIED';

/**
 * サークルの半径。中に入ったと見なす平面距離で、境界値は有効とする。
 *
 * 判定と見た目が同じ数を読む。地面に描く円 (BarrierCircles) もこれを使うので、
 * 「光っている円の中に入れば入ったことになる」が常に成り立つ。
 */
export const DEVICE_INTERACT_RANGE = 3;

export interface BarrierParticipant {
  readonly id: string;
  readonly characterId: CharacterId;
  readonly status: PlayerStatus;
  readonly position: PlanarPosition;
}

export interface BarrierDeviceSnapshot {
  readonly id: BarrierDeviceId;
  readonly anchor: ArenaAnchor;
  readonly status: BarrierDeviceStatus;
}

export interface BarrierChallengeSnapshot {
  readonly phase: BarrierPhase;
  readonly devices: readonly BarrierDeviceSnapshot[];
  /** 今まさに埋まっているサークルの数。 */
  readonly occupiedCount: number;
}

export interface BarrierChallenge {
  /**
   * 今の立ち位置から、サークルの埋まり具合を測り直す。
   *
   * 位置は毎フレーム動くので、判定は行動 (ボタン) ではなく時間で回す。
   *
   * @returns 全サークルが埋まり、結界が解除されたか。
   */
  evaluate(participants: readonly BarrierParticipant[]): { readonly completed: boolean };
  snapshot(): BarrierChallengeSnapshot;
}

interface MutableBarrierDevice {
  readonly id: BarrierDeviceId;
  readonly anchor: ArenaAnchor;
  status: BarrierDeviceStatus;
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

function isInside(device: MutableBarrierDevice, position: PlanarPosition): boolean {
  return (
    Math.hypot(device.anchor.x - position.x, device.anchor.z - position.z) <= DEVICE_INTERACT_RANGE
  );
}

/**
 * ショートスリーパー結界 (docs/phase2-gameplay-spec.md §11)。
 *
 * 解除条件は「3人が別々のサークルへ同時に入る」。順番も専用操作も要らず、
 * 立ち位置だけで決まる。3つのサークルは離れているので、3人が散って同時に
 * 埋める必要があり、協力の形 (§11.1) は保たれる。
 */
export function createBarrierChallenge(phase: BarrierPhase): BarrierChallenge {
  if (!isBarrierPhase(phase)) {
    throw new RangeError('結界フェーズではありません');
  }

  const devices = createDevices();
  let completed = false;

  function snapshot(): BarrierChallengeSnapshot {
    return {
      phase,
      devices: devices.map((device) => ({
        id: device.id,
        anchor: copyAnchor(device.anchor),
        status: device.status,
      })),
      occupiedCount: devices.filter((device) => device.status === 'OCCUPIED').length,
    };
  }

  return {
    evaluate(participants) {
      if (completed) return { completed: false };

      const active = participants.filter((participant) => participant.status === 'ACTIVE');

      // 1人が2つのサークルを兼ねないよう、埋めた人を使い切りで割り当てる。
      // 装置同士は約29ユニット離れており実際には起こらないが、
      // 「3人が別々のサークルへ」というルールを判定の形でも表す。
      const claimed = new Set<string>();
      for (const device of devices) {
        const occupant = active.find(
          (participant) => !claimed.has(participant.id) && isInside(device, participant.position),
        );
        if (occupant === undefined) {
          device.status = 'IDLE';
          continue;
        }
        claimed.add(occupant.id);
        device.status = 'OCCUPIED';
      }

      if (devices.every((device) => device.status === 'OCCUPIED')) {
        completed = true;
        return { completed: true };
      }

      return { completed: false };
    },

    snapshot,
  };
}
