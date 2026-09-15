import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { useRef, type MutableRefObject, type RefObject } from 'react';

/** 戦闘中にユーザーが選べる通常カメラ。ゲーム開始時は third-person。 */
export type BattleCameraMode = 'third-person' | 'overhead' | 'first-person';

const CAMERA_CONFIG = {
  thirdPerson: {
    distance: 7.5,
    height: 4.2,
    lookAtHeight: 1.4,
    followRate: 6,
    targetRate: 7,
  },
  overhead: {
    height: 16,
    distance: 18,
    lookAtHeight: 2,
    followRate: 3,
    targetRate: 5,
  },
  minimumBossDistance: 0.25,
} as const;

export interface BattleThirdPersonCameraProps {
  mode: Exclude<BattleCameraMode, 'first-person'>;
  player: RefObject<Group | null>;
  boss: RefObject<Group | null>;
  /** 入力を World Space へ直すための、演出を含まない基準CameraのYaw。 */
  inputYawRef: MutableRefObject<number>;
  /** Finale の専用Cameraが transform を担当している間は通常Cameraを止める。 */
  active?: boolean;
}

/**
 * Player の背後から Boss を見る通常戦闘用Camera。
 *
 * 俯瞰モードもここで扱い、切替時は現在位置から同じ補間で遷移するため瞬間移動しない。
 * Camera State は描画専用で、Authority へは送らない。
 */
export function BattleThirdPersonCamera({
  mode,
  player,
  boss,
  inputYawRef,
  active = true,
}: BattleThirdPersonCameraProps): null {
  const desiredPosition = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());
  const smoothedTarget = useRef(new Vector3());
  const playerToBoss = useRef(new Vector3(0, 0, -1));

  useFrame(({ camera }, delta) => {
    const playerRoot = player.current;
    const bossRoot = boss.current;
    if (!active || playerRoot === null || bossRoot === null) return;

    const direction = playerToBoss.current;
    const bossDistance = Math.hypot(
      bossRoot.position.x - playerRoot.position.x,
      bossRoot.position.z - playerRoot.position.z,
    );

    // Boss と重なったときは、直前の有効方向を保持してCameraが反転しないようにする。
    if (bossDistance >= CAMERA_CONFIG.minimumBossDistance) {
      direction.set(
        (bossRoot.position.x - playerRoot.position.x) / bossDistance,
        0,
        (bossRoot.position.z - playerRoot.position.z) / bossDistance,
      );
    }

    const config = mode === 'third-person' ? CAMERA_CONFIG.thirdPerson : CAMERA_CONFIG.overhead;
    if (mode === 'third-person') {
      desiredPosition.current
        .copy(playerRoot.position)
        .addScaledVector(direction, -config.distance);
    } else {
      // 既存の戦闘俯瞰と同じ +Z 側の構図を、切替先として維持する。
      desiredPosition.current.set(
        playerRoot.position.x,
        playerRoot.position.y,
        playerRoot.position.z + config.distance,
      );
    }
    desiredPosition.current.y += config.height;

    if (mode === 'third-person') {
      // キャラを画面下寄りに残しつつ、Boss側へ注視点を寄せる。
      desiredTarget.current
        .copy(playerRoot.position)
        .addScaledVector(direction, Math.min(bossDistance, 4));
    } else {
      desiredTarget.current.copy(playerRoot.position);
    }
    desiredTarget.current.y += config.lookAtHeight;

    const positionFactor = 1 - Math.exp(-config.followRate * delta);
    const targetFactor = 1 - Math.exp(-config.targetRate * delta);
    camera.position.lerp(desiredPosition.current, positionFactor);
    smoothedTarget.current.lerp(desiredTarget.current, targetFactor);
    camera.lookAt(smoothedTarget.current);

    // 入力は見た目のCamera座標ではなく、安定した基準方向から求める。
    inputYawRef.current = mode === 'third-person' ? Math.atan2(-direction.x, -direction.z) : 0;
  });

  return null;
}
