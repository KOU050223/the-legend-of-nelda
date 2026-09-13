import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_BOSS_HP } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { Hud, type HudLayer } from './Hud';
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
    vi.useFakeTimers();
    useGameStore.setState({
      combatState: 'INTRO',
      bossHp: INITIAL_BOSS_HP,
      sleepiness: 0,
      lastAction: null,
      lastAttackId: null,
      lastInputRejection: null,
      lastResult: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  describe('イベントフィードバック', () => {
    it.each([
      { lastResult: 'PERFECT_DODGE', message: 'PERFECT DODGE' },
      { lastResult: 'JUST_GUARD', message: 'JUST GUARD' },
      { lastResult: 'TOO_EARLY', message: 'TOO EARLY' },
      { lastResult: 'MISS', message: 'HIT' },
    ] as const)('$lastResult のとき $message を表示する', ({ lastResult, message }) => {
      useGameStore.setState({ lastResult });

      render(<Hud />);

      expect(screen.getByText(message)).toBeInTheDocument();
    });

    it('あくび衝撃波の被弾ではDROWSY!を表示する', () => {
      useGameStore.setState({ lastAttackId: 'YAWN_WAVE', lastResult: 'HIT' });

      render(<Hud />);

      expect(screen.getByText('DROWSY!')).toBeInTheDocument();
    });

    it('ふかふか布団の被弾ではGOOD NIGHTを表示する', () => {
      useGameStore.setState({ lastAttackId: 'FLUFFY_FUTON', lastResult: 'HIT' });

      render(<Hud />);

      expect(screen.getByText('GOOD NIGHT')).toBeInTheDocument();
    });

    it('反撃Window外の攻撃ではWHIFFを表示する', () => {
      useGameStore.setState({ lastInputRejection: 'WHIFF' });

      render(<Hud />);

      expect(screen.getByText('WHIFF')).toBeInTheDocument();
    });

    it('大ダウン中はCOUNTER!を表示する', () => {
      useGameStore.setState({ combatState: 'BOSS_DOWN' });

      render(<Hud />);

      expect(screen.getByText('COUNTER!')).toBeInTheDocument();
    });

    it('イベント表示は所定時間後に消える', () => {
      useGameStore.setState({ lastResult: 'PERFECT_DODGE' });

      render(<Hud eventDurationMs={1_000} />);

      void act(() => vi.advanceTimersByTime(1_000));

      expect(screen.queryByText('PERFECT DODGE')).not.toBeInTheDocument();
    });

    it('同じイベントでも再発時には表示時間をリセットする', () => {
      const { rerender } = render(<Hud eventDurationMs={1_000} />);

      act(() => useGameStore.getState().recordResult('PERFECT_DODGE'));
      void act(() => vi.advanceTimersByTime(1_000));
      expect(screen.queryByText('PERFECT DODGE')).not.toBeInTheDocument();

      act(() => useGameStore.getState().recordResult('PERFECT_DODGE'));
      rerender(<Hud eventDurationMs={1_000} />);

      expect(screen.getByText('PERFECT DODGE')).toBeInTheDocument();
    });
  });

  it('無効にしたレイヤーを描画しない', () => {
    const layers: Partial<Record<HudLayer, boolean>> = {
      BOSS_HP: false,
      SLEEPINESS: false,
      ACTION_UI: false,
      EVENT_UI: false,
    };

    render(<Hud layers={layers} />);

    expect(screen.queryByText('SLEEP DEMON')).not.toBeInTheDocument();
    expect(screen.queryByText('HORI SLEEPINESS')).not.toBeInTheDocument();
    expect(screen.queryByText('READY')).not.toBeInTheDocument();
  });
});
