import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/store/game-store';

import { TutorialGuide } from './TutorialGuide';

describe('TutorialGuide', () => {
  beforeEach(() => {
    useGameStore.setState({
      assistVisible: false,
      lastAttackId: null,
    });
  });

  it('チュートリアル中は現在の攻撃に合わせた操作説明を表示する', () => {
    useGameStore.setState({ assistVisible: true, lastAttackId: 'PILLOW_SWEEP' });

    render(<TutorialGuide />);

    expect(screen.getByRole('status')).toHaveTextContent('左右キーで攻撃をかわしてね');
  });

  it('布団のチュートリアルでは回避してから攻撃する流れを表示する', () => {
    useGameStore.setState({ assistVisible: true, lastAttackId: 'FLUFFY_FUTON' });

    render(<TutorialGuide />);

    expect(screen.getByRole('status')).toHaveTextContent('回避したら SPACE / J で攻撃！');
  });

  it('本戦中はナビゲーションを表示しない', () => {
    useGameStore.setState({ assistVisible: false, lastAttackId: 'YAWN_WAVE' });

    render(<TutorialGuide />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
