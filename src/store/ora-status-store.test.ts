import { beforeEach, describe, expect, it } from 'vitest';

import type { OraHandTrackingFrame } from '@/input/ora/ora-production-input';

import { useOraStatusStore } from './ora-status-store';

const handTrackingFrame: OraHandTrackingFrame = {
  left: { x: 0.2, y: 0.3, velocityX: 0, velocityY: 0, isOpen: true },
  neutral: { x: 0.25, y: 0.35 },
};

beforeEach(() => {
  useOraStatusStore.getState().reset();
});

describe('ora-status-store', () => {
  it('Ora入力の状態を保持し、reset()でHUD表示用の値を初期化する', () => {
    const store = useOraStatusStore.getState();
    store.setActive(true);
    store.setCalibration({ handComplete: true, voiceComplete: false, progress: 0.5 });
    store.setStatus({ phase: 'calibrating', speechRecognition: 'available' });
    store.setVoiceCandidate({ transcript: 'オラ', intensity: 0.42, hits: 1 });
    store.setHandTrackingFrame(handTrackingFrame);

    expect(useOraStatusStore.getState()).toMatchObject({
      active: true,
      calibration: { handComplete: true, voiceComplete: false, progress: 0.5 },
      status: { phase: 'calibrating', speechRecognition: 'available' },
      voiceCandidate: { transcript: 'オラ', intensity: 0.42, hits: 1 },
      handTrackingFrame,
    });

    useOraStatusStore.getState().reset();

    expect(useOraStatusStore.getState()).toMatchObject({
      active: false,
      calibration: null,
      status: null,
      voiceCandidate: null,
      handTrackingFrame: null,
    });
  });

  it('手追跡だけをselectorで購読でき、他の更新では通知しない', () => {
    const frames: Array<OraHandTrackingFrame | null> = [];
    const unsubscribe = useOraStatusStore.subscribe(
      (state) => state.handTrackingFrame,
      (frame) => frames.push(frame),
    );

    useOraStatusStore.getState().setActive(true);
    useOraStatusStore.getState().setCalibration({
      handComplete: false,
      voiceComplete: false,
      progress: 0,
    });
    expect(frames).toEqual([]);

    useOraStatusStore.getState().setHandTrackingFrame(handTrackingFrame);
    expect(frames).toEqual([handTrackingFrame]);

    unsubscribe();
    useOraStatusStore.getState().setHandTrackingFrame(null);
    expect(frames).toEqual([handTrackingFrame]);
  });
});
