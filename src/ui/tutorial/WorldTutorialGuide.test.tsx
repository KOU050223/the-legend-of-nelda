import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorldTutorialStore } from './world-tutorial-store';
import { WorldTutorialGuide } from './WorldTutorialGuide';

describe('WorldTutorialGuide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorldTutorialStore.setState({ visible: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ワールドの操作方法を表示する', () => {
    render(<WorldTutorialGuide />);

    expect(screen.getByRole('status')).toHaveTextContent('WASD / 矢印キー：移動');
    expect(screen.getByRole('status')).toHaveTextContent('SPACE / J：攻撃');
    expect(screen.getByRole('status')).toHaveTextContent('SHIFT：回避');
    expect(screen.getByRole('status')).toHaveTextContent('E：調べる');
  });

  it('表示開始から15秒後に案内を消す', async () => {
    render(<WorldTutorialGuide />);

    await act(() => vi.advanceTimersByTime(14_999));
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(useWorldTutorialStore.getState().visible).toBe(false);
  });
});
