import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '@/store/game-store';

import { App } from './App';
import { useScreenStore } from './screen';

/**
 * GameScene は中身ではなく「ワールドとして描くよう伝えられたか」だけ見たいので、
 * 受け取った props を記録するだけのモックに差し替える。
 */
const gameSceneProps: { world?: boolean }[] = [];
vi.mock('@/rendering/scene/GameScene', () => ({
  GameScene: (props: { world?: boolean }) => {
    gameSceneProps.push(props);
    return null;
  },
}));

describe('ルートの画面遷移', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useScreenStore.setState({ screen: 'TITLE' });
    window.history.replaceState({}, '', '/');
    gameSceneProps.length = 0;
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

  it('「ワールドへ」で出るのは戦闘ではなくワールドの中身 (Issue #63)', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'ワールドへ' }));

    // URL に ?scene=world が無くても、画面がワールドならワールドとして描く。
    // ここが戦闘のままだと、リンク先が Combat の見た目になってしまう。
    expect(gameSceneProps.at(-1)?.world).toBe(true);
  });

  it('戦闘画面はワールドとして描かない (Issue #63)', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    expect(gameSceneProps.at(-1)?.world).toBeFalsy();
  });

  it('画面を選ぶと直接開ける URL に移動する', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    expect(window.location.pathname).toBe('/battle');
  });

  it('ブラウザの戻る操作で画面もタイトルへ戻る', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));
    window.history.replaceState({}, '', '/');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(useScreenStore.getState().screen).toBe('TITLE');
    expect(screen.getByRole('heading', { name: '寝ルダの伝説' })).toBeInTheDocument();
  });
});
