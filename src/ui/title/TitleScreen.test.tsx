import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useScreenStore } from '@/app/screen';

import { TitleScreen } from './TitleScreen';

describe('タイトル画面', () => {
  beforeEach(() => {
    useScreenStore.setState({ screen: 'TITLE' });
    window.history.replaceState({}, '', '/');
  });
  afterEach(cleanup);

  it('タイトルと副題が出る (Issue #63)', () => {
    render(<TitleScreen />);

    expect(screen.getByRole('heading', { name: '寝ルダの伝説' })).toBeInTheDocument();
    expect(screen.getByText('〜3人の勇者と眠らない男〜')).toBeInTheDocument();
  });

  it('「はじめから」を押すと戦闘へ移る (Issue #63)', () => {
    render(<TitleScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    expect(useScreenStore.getState().screen).toBe('BATTLE');
  });

  it('並ぶのは今そこへ行ける画面だけで、押せば必ずその画面へ移る (Issue #63)', () => {
    render(<TitleScreen />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      useScreenStore.setState({ screen: 'TITLE' });
      fireEvent.click(button);
      expect(useScreenStore.getState().screen).not.toBe('TITLE');
    }
  });
});
