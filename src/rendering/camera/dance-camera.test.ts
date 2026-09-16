import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';

import {
  DANCE_CAMERA_LOOP_SECONDS,
  applyDanceCameraOffset,
  danceCameraOffset,
  nextDanceCameraMode,
  readDanceCameraDebugSettings,
} from './dance-camera';

describe('danceCameraOffset', () => {
  it('強制視点は同じmodeを連続させず、ランダム候補から選ぶ', () => {
    expect(nextDanceCameraMode('third-person', () => 0)).toBe('overhead');
    expect(nextDanceCameraMode('third-person', () => 0.99)).toBe('first-person');
  });

  it('固定 loop の同じ位相では常に同じ offset になる', () => {
    const current = danceCameraOffset(0.73, 'third-person');
    const nextLoop = danceCameraOffset(0.73 + DANCE_CAMERA_LOOP_SECONDS, 'third-person');

    expect(nextLoop.yaw).toBeCloseTo(current.yaw);
    expect(nextLoop.pitch).toBeCloseTo(current.pitch);
    expect(nextLoop.roll).toBeCloseTo(current.roll);
    expect(nextLoop.bobY).toBeCloseTo(current.bobY);
    expect(nextLoop.swayX).toBeCloseTo(current.swayX);
    expect(nextLoop.zoom).toBeCloseTo(current.zoom);
  });

  it('first-person は third-person より穏やかな位置・roll になる', () => {
    const thirdPerson = danceCameraOffset(0.5, 'third-person');
    const firstPerson = danceCameraOffset(0.5, 'first-person');

    expect(Math.abs(firstPerson.roll)).toBeLessThan(Math.abs(thirdPerson.roll));
    expect(Math.abs(firstPerson.zoom)).toBeLessThan(Math.abs(thirdPerson.zoom));
    expect(firstPerson.bobY).toBeLessThan(thirdPerson.bobY);
    expect(Math.abs(firstPerson.swayX)).toBeLessThan(Math.abs(thirdPerson.swayX));
  });

  it('intensity 0 はCamera transformを変えない', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(2, 3, 4);
    camera.rotation.set(0.2, -0.4, 0.1);
    const position = camera.position.clone();
    const rotation = camera.rotation.clone();

    applyDanceCameraOffset(camera, danceCameraOffset(1.2, 'overhead', 0));

    expect(camera.position).toEqual(position);
    expect(camera.rotation.x).toBeCloseTo(rotation.x);
    expect(camera.rotation.y).toBeCloseTo(rotation.y);
    expect(camera.rotation.z).toBeCloseTo(rotation.z);
  });

  it('開発用queryはroleを偽装せず、ODORUNO用のdebug強度だけを強制する', () => {
    const settings = readDanceCameraDebugSettings('?debug=dance-camera');

    expect(settings.visible).toBe(true);
    expect(settings.force).toBe(true);
    expect(settings.intensity).toBe(1);
    expect(settings.speed).toBe(1);
  });

  it('未指定の調整queryを強度0・速度0として扱わない', () => {
    const settings = readDanceCameraDebugSettings(
      '?debug=dance-camera&dance-intensity=&dance-speed=',
    );

    expect(settings.intensity).toBe(1);
    expect(settings.speed).toBe(1);
  });
});
