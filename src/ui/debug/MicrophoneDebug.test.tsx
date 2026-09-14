import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MicrophoneDebug } from './MicrophoneDebug';

/**
 * 表示の切り替えとマイクの後始末だけを確認する。
 * 数値の見やすさは実機の Manual Test で見る (docs/testing-strategy.md §11)。
 */

const detach = vi.fn<() => void>();

vi.mock('@/input/microphone/microphone-adapter', () => ({
  attachMicrophoneNoteInput: vi.fn<() => Promise<() => void>>(() => Promise.resolve(detach)),
}));

const { attachMicrophoneNoteInput } = await import('@/input/microphone/microphone-adapter');
const attachMock = vi.mocked(attachMicrophoneNoteInput);

/** ボタンを押して、その結果の再描画まで待つ。 */
async function clickButton(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

afterEach(() => {
  vi.clearAllMocks();
  attachMock.mockImplementation(() => Promise.resolve(detach));
});

describe('MicrophoneDebug', () => {
  it('最初はマイクを要求せず、有効化を待つ', () => {
    render(<MicrophoneDebug />);

    expect(attachMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'マイク入力を有効にする' })).toBeInTheDocument();
  });

  it('ユーザー操作で初めてマイクを要求する', async () => {
    render(<MicrophoneDebug />);

    await clickButton('マイク入力を有効にする');

    expect(attachMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'マイク入力を停止する' })).toBeInTheDocument();
    });
  });

  it('停止するとマイクを解放して元の表示へ戻る', async () => {
    render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');
    await screen.findByRole('button', { name: 'マイク入力を停止する' });

    await clickButton('マイク入力を停止する');

    expect(detach).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'マイク入力を有効にする' })).toBeInTheDocument();
  });

  it('マイクを拒否されたら理由を表示する', async () => {
    attachMock.mockImplementation(() => Promise.reject(new Error('Permission denied')));
    render(<MicrophoneDebug />);

    await clickButton('マイク入力を有効にする');

    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'マイク入力を有効にする' })).toBeInTheDocument();
  });

  it('拒否されたあとでも再試行できる', async () => {
    attachMock.mockImplementationOnce(() => Promise.reject(new Error('Permission denied')));
    render(<MicrophoneDebug />);

    await clickButton('マイク入力を有効にする');
    await screen.findByText('Permission denied');
    await clickButton('マイク入力を有効にする');

    expect(attachMock).toHaveBeenCalledTimes(2);
  });

  // 権限プロンプト待ちの間に二度押ししても、掴んだマイクを取りこぼさない。
  it('連打しても二重にマイクを掴まない', async () => {
    render(<MicrophoneDebug />);
    const button = screen.getByRole('button', { name: 'マイク入力を有効にする' });

    // await を挟まず連続で押し、権限プロンプト待ちの二度押しを再現する。
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(attachMock).toHaveBeenCalledTimes(1);
  });

  it('画面を離れたらマイクを解放する', async () => {
    const { unmount } = render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');
    await screen.findByRole('button', { name: 'マイク入力を停止する' });

    unmount();

    expect(detach).toHaveBeenCalledTimes(1);
  });

  // 許可がアンマウント後に下りるケース。掴んだ直後に手放さないと残り続ける。
  it('許可が下りる前に画面を離れてもマイクを掴んだままにしない', async () => {
    let resolveAttach: ((stop: () => void) => void) | undefined;
    attachMock.mockImplementation(
      () =>
        new Promise<() => void>((resolve) => {
          resolveAttach = resolve;
        }),
    );

    const { unmount } = render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');

    unmount();
    resolveAttach?.(detach);

    await waitFor(() => {
      expect(detach).toHaveBeenCalledTimes(1);
    });
  });
});
