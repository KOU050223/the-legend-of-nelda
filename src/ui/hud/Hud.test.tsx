import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_BOSS_HP, useGameStore } from '@/store/game-store';

import { Hud } from './Hud';

/**
 * HUD は「状態に応じた表示の切り替え」だけをテストする。
 * レイアウト・見やすさは Manual Test で確認する
 * (docs/testing-strategy.md §11)。
 */
describe('Hud', () => {
  // setState は merge のため、このテストが読む項目を明示的に戻す。
  // 参照する項目を増やしたら、ここへも追加する。
  beforeEach(() => {
    useGameStore.setState({
      bossHp: INITIAL_BOSS_HP,
      sleepiness: 0,
      lastAction: null,
    });
  });

  it('storeのSLEEPINESSを表示する', () => {
    useGameStore.setState({ sleepiness: 42 });

    render(<Hud />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('入力がまだ無い場合はREADYを表示する', () => {
    render(<Hud />);

    expect(screen.getByText('READY')).toBeInTheDocument();
  });

  it('直前の入力を表示する', () => {
    useGameStore.setState({ lastAction: 'DODGE_LEFT' });

    render(<Hud />);

    expect(screen.getByText('DODGE_LEFT')).toBeInTheDocument();
  });
});
