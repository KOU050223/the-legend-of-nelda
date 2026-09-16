import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

import { applyDanceCameraOffset, danceCameraOffset, type DanceCameraProfile } from './dance-camera';

const EYE_HEIGHT = 1.55;
const LOOK_SENSITIVITY = 0.0025;
const MAX_PITCH = MathUtils.degToRad(70);
const FOLLOW_RATE = 18;

export interface FirstPersonCameraProps {
  player: RefObject<Group | null>;
  /** 入力を World Space へ直すための、演出を含まないCameraのYaw。 */
  inputYawRef: MutableRefObject<number>;
  active?: boolean;
  /** Base Camera の後段へ合成する、Client-local な見ざる演出。 */
  danceEffect?: boolean;
  danceIntensity?: number;
  danceSpeed?: number;
  danceProfile?: DanceCameraProfile;
  /** 表示用視点が切り替わっていても、選択中ならマウス入力は維持する。 */
  inputActive?: boolean;
  /** Dance後のyawを入力へ混ぜないため、選択中のBase Cameraだけが更新する。 */
  writesInputYaw?: boolean;
}

/**
 * 自キャラの目線位置から表示するClient-localなCamera。
 *
 * CanvasをクリックするとPointer Lockでマウス視点を有効にする。Cameraの向きは
 * Authorityへ送らず、`inputYawRef` を通じてMOVE入力の変換だけに利用する。
 */
export function FirstPersonCamera({
  player,
  inputYawRef,
  active = true,
  danceEffect = false,
  danceIntensity = 1,
  danceSpeed = 1,
  danceProfile = 'normal',
  inputActive = active,
  writesInputYaw = true,
}: FirstPersonCameraProps): null {
  const gl = useThree((state) => state.gl);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const desiredPosition = useRef(new Vector3());
  const smoothedPosition = useRef(new Vector3());
  const hasSmoothedPosition = useRef(false);

  useEffect(() => {
    if (!inputActive) return undefined;

    // 3人称から切り替えた瞬間は、現在のキャラクターの向きを初期視線にする。
    yaw.current = player.current?.rotation.y ?? yaw.current;
    pitch.current = 0;
    inputYawRef.current = yaw.current;

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * LOOK_SENSITIVITY;
      pitch.current = MathUtils.clamp(
        pitch.current - event.movementY * LOOK_SENSITIVITY,
        -MAX_PITCH,
        MAX_PITCH,
      );
    };
    const requestPointerLock = () => {
      void gl.domElement.requestPointerLock?.();
    };

    window.addEventListener('mousemove', onMouseMove);
    gl.domElement.addEventListener('click', requestPointerLock);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      gl.domElement.removeEventListener('click', requestPointerLock);
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    };
  }, [gl, inputActive, inputYawRef, player]);

  useFrame(({ camera, clock }, delta) => {
    const root = player.current;
    if (!active || root === null) return;

    desiredPosition.current.copy(root.position);
    desiredPosition.current.y += EYE_HEIGHT;
    // 前フレームのDance後 position を再利用しない。Base + Offset を毎フレーム
    // 作り直して、ダンスの位置変化が追従Cameraへ累積しないようにする。
    if (!hasSmoothedPosition.current) {
      smoothedPosition.current.copy(camera.position);
      hasSmoothedPosition.current = true;
    }
    smoothedPosition.current.lerp(desiredPosition.current, 1 - Math.exp(-FOLLOW_RATE * delta));
    camera.position.copy(smoothedPosition.current);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    if (writesInputYaw) inputYawRef.current = yaw.current;

    if (danceEffect) {
      applyDanceCameraOffset(
        camera,
        danceCameraOffset(
          clock.getElapsedTime() * danceSpeed,
          'first-person',
          danceIntensity,
          danceProfile,
        ),
      );
    }
  });

  return null;
}
