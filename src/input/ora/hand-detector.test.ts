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

function handLandmarks(isOpen: boolean) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[0] = { x: 0.5, y: 0.8 };

  for (const [pipIndex, tipIndex] of [
    [6, 8],
    [10, 12],
    [14, 16],
    [18, 20],
  ] as const) {
    landmarks[pipIndex] = { x: 0.5, y: isOpen ? 0.45 : 0.65 };
    landmarks[tipIndex] = { x: isOpen ? 0.5 : 0.55, y: isOpen ? 0.1 : 0.75 };
  }

  return landmarks;
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

  it('左右の手首を鏡像のxで返し、それぞれ同じ側の前フレームから速度を計算する', async () => {
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

    // フロントカメラの生フレームは鏡像ではないため、xは 1 - 生の値 になる。
    expect(first).toMatchObject({
      capturedAt: 1_000,
      left: { y: 0.3, velocityX: 0, velocityY: 0 },
      right: { y: 0.8, velocityX: 0, velocityY: 0 },
    });
    expect(first.left?.x).toBeCloseTo(0.8);
    expect(first.right?.x).toBeCloseTo(0.3);
    expect(second).toMatchObject({
      capturedAt: 1_100,
      left: { y: 0.4 },
      right: { y: 0.7 },
    });
    expect(second.left?.x).toBeCloseTo(0.7);
    expect(second.right?.x).toBeCloseTo(0.2);
    expect(second.left?.velocityX).toBeCloseTo(-1);
    expect(second.left?.velocityY).toBeCloseTo(1);
    expect(second.right?.velocityX).toBeCloseTo(-1);
    expect(second.right?.velocityY).toBeCloseTo(-1);
  });

  it('4本の指が手首からPIPより十分遠い場合は開いた手として返す', async () => {
    mocks.detectForVideo.mockReturnValueOnce({
      handedness: [[{ categoryName: 'Left' }]],
      landmarks: [handLandmarks(true)],
    });

    const detector = await createMediaPipeHandDetector();

    const result = detector.detect(document.createElement('video'), 1_000);

    expect(result.left?.isOpen).toBe(true);
    expect(result.left?.isClosed).toBe(false);
  });

  it('4本の指が曲がっている場合は開いた手ではないとして返す', async () => {
    mocks.detectForVideo.mockReturnValueOnce({
      handedness: [[{ categoryName: 'Right' }]],
      landmarks: [handLandmarks(false)],
    });

    const detector = await createMediaPipeHandDetector();

    const result = detector.detect(document.createElement('video'), 1_000);

    expect(result.right?.isOpen).toBe(false);
    expect(result.right?.isClosed).toBe(true);
  });
});
