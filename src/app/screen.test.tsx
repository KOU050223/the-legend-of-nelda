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

/**
 * 確認用ページは 3D Canvas を持つため jsdom では描けない。ここで見たいのは
 * 「?debug=motion でこの画面へ入るか」だけなので、目印に差し替える。
 *
 * 本番バンドルへ入れないよう lazy() で読むので、出てくるのを待ってから見る。
 */
vi.mock('@/ui/motion-debug/MotionDebugPage', () => ({
  MotionDebugPage: () => <div data-testid="motion-debug" />,
}));

vi.mock('@/intro/IntroCutscene', () => ({
  IntroCutscene: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      イントロをスキップ
    </button>
  ),
}));

vi.mock('@/ui/matching/MatchingScreen', () => ({
  MatchingScreen: () => <div data-testid="matching-screen" />,
}));

describe('ルートの画面遷移', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    useGameStore.getState().reset();
    useScreenStore.setState({ screen: 'TITLE' });
    window.history.replaceState({}, '', '/');
    gameSceneProps.length = 0;
  });
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('?debug=motion はタイトルを経由せずモーション確認画面を出す', async () => {
    window.history.replaceState({}, '', '/?debug=motion');

    render(<App />);

    expect(await screen.findByTestId('motion-debug')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '寝ルダの伝説' })).not.toBeInTheDocument();
  });

  // ボス専用だった頃の入口。手順書やブックマークに残っているため受け続ける。
  it('旧称の ?debug=hori も同じ画面を出す', async () => {
    window.history.replaceState({}, '', '/?debug=hori');

    render(<App />);

    expect(await screen.findByTestId('motion-debug')).toBeInTheDocument();
  });

  it('最初に開くのはタイトルで、戦闘は始まっていない (Issue #63)', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '寝ルダの伝説' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '演出設定' })).not.toBeInTheDocument();
  });

  it('タイトルから「はじめから」を押すとイントロ画面が出る (Issue #64)', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    expect(screen.getByRole('button', { name: 'イントロをスキップ' })).toBeInTheDocument();
  });

  it('「ワールドへ」で出るのは戦闘ではなくワールドの中身 (Issue #63)', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'ワールドへ' }));

    // URL に ?scene=world が無くても、画面がワールドならワールドとして描く。
    // ここが戦闘のままだと、リンク先が Combat の見た目になってしまう。
    expect(gameSceneProps.at(-1)?.world).toBe(true);
  });

  it('イントロをスキップするとマッチングを開く', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    fireEvent.click(screen.getByRole('button', { name: 'イントロをスキップ' }));

    expect(screen.getByTestId('matching-screen')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/matching');
  });

  it('マッチングURLを開くとマッチング画面を表示する', () => {
    window.history.replaceState({}, '', '/matching');
    useScreenStore.setState({ screen: 'MATCHING' });

    render(<App />);

    expect(screen.getByTestId('matching-screen')).toBeInTheDocument();
  });

  it('画面を選ぶと直接開ける URL に移動する', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));

    expect(window.location.pathname).toBe('/intro');
  });

  it('ブラウザの戻る操作で画面もタイトルへ戻る', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'はじめから' }));
    window.history.replaceState({}, '', '/');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(useScreenStore.getState().screen).toBe('TITLE');
    expect(screen.getByRole('heading', { name: '寝ルダの伝説' })).toBeInTheDocument();
  });

  it('ワールドでは Phase 1 の戦闘一式を起動しない (#58)', () => {
    // ワールドには堀大輔が居て Phase 2 の戦闘が動く。Phase 1 は
    // PlayerAction 前提でキー割り当ても噛み合わず、両方起動すると
    // WASD が移動と回避の両方に解釈される。
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'ワールドへ' }));

    expect(screen.queryByRole('region', { name: '演出設定' })).not.toBeInTheDocument();
  });
});
