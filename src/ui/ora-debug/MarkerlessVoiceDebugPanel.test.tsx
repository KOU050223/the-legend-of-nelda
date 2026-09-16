import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkerlessVoiceDebugPanel } from './MarkerlessVoiceDebugPanel';

const mocks = vi.hoisted(() => ({
  createMediaPipeHandDetector: vi.fn<() => Promise<unknown>>(),
  requestWebcam: vi.fn<() => Promise<unknown>>(),
  stopWebcam: vi.fn<(stream: unknown) => void>(),
}));

vi.mock('@/input/ora/hand-detector', () => ({
  createMediaPipeHandDetector: mocks.createMediaPipeHandDetector,
}));

vi.mock('@/input/ora/webcam', () => ({
  requestWebcam: mocks.requestWebcam,
  stopWebcam: mocks.stopWebcam,
}));

describe('MarkerlessVoiceDebugPanel', () => {
  const frameCallbacks = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    frameCallbacks.clear();
    nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
      frameCallbacks.delete(frameId);
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('検出ループ例外時にカメラ資源を解放してエラー表示へ遷移する', async () => {
    const cameraStream = { getTracks: vi.fn<() => readonly []>() };
    const detector = {
      close: vi.fn<() => void>(),
      detect: vi
        .fn<() => unknown>()
        .mockReturnValueOnce({ capturedAt: 0 })
        .mockImplementationOnce(() => {
          throw new Error('detector failed');
        }),
    };
    mocks.requestWebcam.mockResolvedValue(cameraStream);
    mocks.createMediaPipeHandDetector.mockResolvedValue(detector);

    render(<MarkerlessVoiceDebugPanel />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Markerlessカメラを開始' }));
    });
    await waitFor(() => {
      expect(frameCallbacks).toHaveLength(1);
    });

    const frame = frameCallbacks.values().next().value;
    if (frame === undefined) throw new Error('検出フレームが予約されていません。');
    await act(async () => {
      frame(performance.now());
    });

    expect(detector.close).toHaveBeenCalledOnce();
    expect(mocks.stopWebcam).toHaveBeenCalledWith(cameraStream);
    expect(screen.getByText('detector failed')).toBeInTheDocument();
    expect(screen.getByText('エラー', { selector: 'dd' })).toBeInTheDocument();
  });
});
