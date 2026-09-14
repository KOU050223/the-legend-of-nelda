import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WasshoiInputController } from '@/input/wasshoi/wasshoi-input';
import type { WasshoiEvent } from '@/input/wasshoi/types';

import { WasshoiDebug } from './WasshoiDebug';

const stop = vi.fn<() => void>();
const startRecording = vi.fn<() => void>();
const stopRecording = vi.fn<() => Promise<Blob>>(() => Promise.resolve(new Blob(['wasshoi'])));
const controller: WasshoiInputController = {
  startRecording,
  stopRecording,
  isRecording: () => false,
  stop,
};

vi.mock('@/input/wasshoi/wasshoi-input', () => ({
  attachWasshoiInput: vi.fn<() => Promise<WasshoiInputController>>(() =>
    Promise.resolve(controller),
  ),
}));

const { attachWasshoiInput } = await import('@/input/wasshoi/wasshoi-input');
const attachMock = vi.mocked(attachWasshoiInput);

afterEach(() => {
  vi.clearAllMocks();
  attachMock.mockImplementation(() => Promise.resolve(controller));
});

describe('WasshoiDebug', () => {
  it('最初はユーザー操作までマイクを要求しない', () => {
    render(<WasshoiDebug />);

    expect(attachMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'マイク入力を有効にする' })).toBeInTheDocument();
  });

  it('有効化後に本人のわっしょーいを録音できる', async () => {
    render(<WasshoiDebug />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'マイク入力を有効にする' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '「わっしょーい」を録音する' }));
    });

    expect(startRecording).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '録音を完了する' })).toBeInTheDocument();
  });

  it('発話が終わると最後のWasshoiEventを表示する', async () => {
    let emit: ((event: WasshoiEvent) => void) | undefined;
    attachMock.mockImplementation((onEvent) => {
      emit = onEvent;
      return Promise.resolve(controller);
    });
    render(<WasshoiDebug />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'マイク入力を有効にする' }));
    });
    await act(async () => {
      emit?.({ type: 'WASSHOI', intensity: 0.72, durationMs: 840 });
    });

    expect(screen.getByLabelText('最後のWasshoiEvent')).toHaveTextContent('"intensity":0.72');
    expect(screen.getByLabelText('最後のWasshoiEvent')).toHaveTextContent('"durationMs":840');
  });

  it('画面を離れるとマイク入力を停止する', async () => {
    const { unmount } = render(<WasshoiDebug />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'マイク入力を有効にする' }));
    });

    unmount();

    expect(stop).toHaveBeenCalledOnce();
  });
});
