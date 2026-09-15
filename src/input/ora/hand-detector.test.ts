import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockDetectResult = {
  handedness: Array<Array<{ categoryName: string }>>;
  landmarks: Array<Array<{ x: number; y: number }>>;
};

const mocks = vi.hoisted(() => ({
  createFromOptions:
    vi.fn<() => Promise<{ close: () => void; detectForVideo: () => MockDetectResult }>>(),
  detectForVideo: vi.fn<() => MockDetectResult>(),
  close: vi.fn<() => void>(),
  forVisionTasks: vi.fn<() => Promise<Record<string, never>>>(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.forVisionTasks },
  HandLandmarker: { createFromOptions: mocks.createFromOptions },
}));

import { createMediaPipeHandDetector } from './hand-detector';

function wrist(x: number, y: number) {
  return [{ x, y }];
}

describe('createMediaPipeHandDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forVisionTasks.mockResolvedValue({});
    mocks.createFromOptions.mockResolvedValue({
      close: mocks.close,
      detectForVideo: mocks.detectForVideo,
    });
  });

  it('左右の手首を返し、それぞれ同じ側の前フレームから速度を計算する', async () => {
    mocks.detectForVideo
      .mockReturnValueOnce({
        handedness: [[{ categoryName: 'Left' }], [{ categoryName: 'Right' }]],
        landmarks: [wrist(0.2, 0.3), wrist(0.7, 0.8)],
      })
      .mockReturnValueOnce({
        handedness: [[{ categoryName: 'Left' }], [{ categoryName: 'Right' }]],
        landmarks: [wrist(0.3, 0.4), wrist(0.8, 0.7)],
      });

    const detector = await createMediaPipeHandDetector();
    const video = document.createElement('video');

    const first = detector.detect(video, 1_000);
    const second = detector.detect(video, 1_100);

    expect(first).toEqual({
      capturedAt: 1_000,
      left: { x: 0.2, y: 0.3, velocityX: 0, velocityY: 0 },
      right: { x: 0.7, y: 0.8, velocityX: 0, velocityY: 0 },
    });
    expect(second).toMatchObject({
      capturedAt: 1_100,
      left: { x: 0.3, y: 0.4 },
      right: { x: 0.8, y: 0.7 },
    });
    expect(second.left?.velocityX).toBeCloseTo(1);
    expect(second.left?.velocityY).toBeCloseTo(1);
    expect(second.right?.velocityX).toBeCloseTo(1);
    expect(second.right?.velocityY).toBeCloseTo(-1);
  });
});
