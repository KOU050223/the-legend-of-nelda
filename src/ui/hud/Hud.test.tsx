import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_BOSS_HP } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { Hud } from './Hud';
import styles from './Hud.module.css';

/**
 * HUD は「状態に応じた表示の切り替え」だけをテストする。
 * レイアウト・見やすさは Manual Test で確認する
 * (docs/testing-strategy.md §11)。
 */
function renderGaugeFill(bossHp: number): HTMLElement {
  useGameStore.setState({ bossHp });
  const { container } = render(<Hud />);

  const fill = container.querySelector<HTMLElement>(`.${styles.gaugeFill}`);
  if (fill === null) throw new Error('gaugeFill が描画されていない');
  return fill;
}

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

  it('SLEEPINESSの値を表示する', () => {
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

  // Boss HP はゲージ幅という「値そのものが画面に出ない」形で表示されるため、
  // style から検証する。HP 0 で幅が残る / 満タンで 100% にならない類の
  // 不具合は目視では気づきにくい。
  describe('Boss HPゲージ', () => {
    it.each([
      { bossHp: INITIAL_BOSS_HP, width: '100%' },
      { bossHp: INITIAL_BOSS_HP / 2, width: '50%' },
      { bossHp: 0, width: '0%' },
    ])('Boss HPが $bossHp なら幅 $width になる', ({ bossHp, width }) => {
      expect(renderGaugeFill(bossHp).style.width).toBe(width);
    });
  });
});
