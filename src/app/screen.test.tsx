import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '@/store/game-store';

import { App } from './App';
import { useScreenStore } from './screen';

vi.mock('@/rendering/scene/GameScene', () => ({ GameScene: () => null }));

describe('ルートの画面遷移', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useScreenStore.setState({ screen: 'TITLE' });
  });
  afterEach(cleanup);

  it('最初に開くのはタイトルで、戦闘は始まっていない (Issue #63)', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '寝ルダの伝説' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '演出設定' })).not.toBeInTheDocument();
  });

  it('タイトルから「はじめから」を押すと戦闘画面が出る (Issue #63)', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    expect(screen.queryByRole('heading', { name: '寝ルダの伝説' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '演出設定' })).toBeInTheDocument();
  });
});
