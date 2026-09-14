import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hzToNote } from '@/input/microphone/note-classifier';
import type { NoteEventListener } from '@/input/microphone/types';

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

/** Adapter が通知するはずの NoteEvent を、テストから流し込めるようにする。 */
function captureListener(): () => NoteEventListener {
  let listener: NoteEventListener | undefined;
  attachMock.mockImplementation((onNote: NoteEventListener) => {
    listener = onNote;
    return Promise.resolve(detach);
  });

  return () => {
    if (listener === undefined) throw new Error('まだ購読が始まっていない');
    return listener;
  };
}

/** 画面上で label に対応する値を読む。 */
function valueOf(label: string): string {
  const term = screen.getByText(label);
  const value = term.nextElementSibling?.textContent;
  if (value === undefined || value === null) throw new Error(`${label} の値が無い`);
  return value;
}

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

  // パネルの目的は確定音とコマンドを実機で読めること。(Issue #43)
  it('確定した音をドレミとコマンドに換えて表示する', async () => {
    const getListener = captureListener();
    render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');

    const note = hzToNote(523.25, 0.97);
    if (note === null) throw new Error('C5 を作れない');
    await act(async () => {
      getListener()({ type: 'note-on', note });
    });

    expect(valueOf('Note')).toBe('C5');
    expect(valueOf('Solfège')).toBe('ド');
    expect(valueOf('Stable')).toBe('C');
    expect(valueOf('Command')).toBe('DO');
  });

  it('対象外の音はコマンドとして扱わない', async () => {
    const getListener = captureListener();
    render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');

    const note = hzToNote(587.33, 0.97); // D5
    if (note === null) throw new Error('D5 を作れない');
    await act(async () => {
      getListener()({ type: 'note-on', note });
    });

    expect(valueOf('Note')).toBe('D5');
    expect(valueOf('Command')).toBe('IGNORE');
  });

  it('鳴り終わったら確定音の表示を消す', async () => {
    const getListener = captureListener();
    render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');

    const note = hzToNote(523.25, 0.97);
    if (note === null) throw new Error('C5 を作れない');
    await act(async () => {
      getListener()({ type: 'note-on', note });
    });
    await act(async () => {
      getListener()({ type: 'note-off', note });
    });

    expect(valueOf('Note')).toBe('—');
    expect(valueOf('Command')).toBe('IGNORE');
  });

  it('持ち替えたら新しい音を表示する', async () => {
    const getListener = captureListener();
    render(<MicrophoneDebug />);
    await clickButton('マイク入力を有効にする');

    const previous = hzToNote(523.25, 0.97);
    const next = hzToNote(659.25, 0.97);
    if (previous === null || next === null) throw new Error('音を作れない');
    await act(async () => {
      getListener()({ type: 'note-on', note: previous });
    });
    await act(async () => {
      getListener()({ type: 'note-change', previous, note: next });
    });

    expect(valueOf('Note')).toBe('E5');
    expect(valueOf('Solfège')).toBe('ミ');
    expect(valueOf('Command')).toBe('MI');
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
