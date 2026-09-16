import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useScreenStore } from '@/app/screen';

import { TitleScreen } from './TitleScreen';

describe('タイトル画面', () => {
  beforeEach(() => {
    useScreenStore.setState({ screen: 'TITLE' });
    window.history.replaceState({}, '', '/');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('タイトルと副題が出る (Issue #63)', () => {
    render(<TitleScreen />);

    expect(screen.getByRole('heading', { name: '寝ルダの伝説' })).toBeInTheDocument();
    expect(screen.getByText('〜3人の勇者と眠らない男〜')).toBeInTheDocument();
  });

  it('final_sward2を最大音量でループ再生する', () => {
    const { container } = render(<TitleScreen />);
    const bgm = container.querySelector('audio');

    expect(bgm).toHaveAttribute('autoplay');
    expect(bgm).toHaveAttribute('loop');
    expect(bgm).toHaveProperty('volume', 1);
    expect(bgm?.querySelector('source')).toHaveAttribute('src', '/audio/final_sward2.mp3');
  });

  it('自動再生を拒否されたときはBGM再生ボタンを出す', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('blocked'));
    render(<TitleScreen />);

    expect(await screen.findByRole('button', { name: 'BGMを再生' })).toBeInTheDocument();
  });

  it('「ひとりで」を押すとイントロへ移り、ひとり用モードを選ぶ (Issue #110)', () => {
    render(<TitleScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'ひとりで' }));

    expect(useScreenStore.getState().screen).toBe('INTRO');
    expect(useScreenStore.getState().mode).toBe('SINGLE');
  });

  it('「みんなで」を押すとイントロへ移り、マルチ用モードを選ぶ (Issue #110)', () => {
    render(<TitleScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'みんなで' }));

    expect(useScreenStore.getState().screen).toBe('INTRO');
    expect(useScreenStore.getState().mode).toBe('MULTIPLAYER');
  });

  it('並ぶのは今そこへ行ける画面だけで、押せば必ずその画面へ移る (Issue #63)', () => {
    render(<TitleScreen />);

    const buttons = within(screen.getByRole('navigation', { name: 'メニュー' })).getAllByRole(
      'button',
    );
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      useScreenStore.setState({ screen: 'TITLE' });
      fireEvent.click(button);
      expect(useScreenStore.getState().screen).not.toBe('TITLE');
    }
  });
});
