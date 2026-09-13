import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_BOSS_HP, MAX_SLEEPINESS } from '@/game/config/combat-balance';
import { useGameStore } from '@/store/game-store';

import { Hud } from './Hud';
import type { HudLayer } from './hud-layers';
import styles from './Hud.module.css';

/**
 * HUD は「状態に応じた表示の切り替え」だけをテストする。
 * レイアウト・見やすさは Manual Test で確認する
 * (docs/testing-strategy.md §11)。
 */
function renderGaugeFill(bossHp: number, bossHpMax = INITIAL_BOSS_HP): HTMLElement {
  useGameStore.setState({ bossHp, bossHpMax });
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
      bossHpMax: INITIAL_BOSS_HP,
      sleepiness: 0,
      sleepinessMax: MAX_SLEEPINESS,
      lastAction: null,
      lastAttackId: null,
      eventFeedback: null,
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

  it('上限を変更した戦闘でもSLEEPINESSを上限に対する割合で表示する', () => {
    useGameStore.setState({ sleepiness: 100, sleepinessMax: 200 });

    render(<Hud />);

    expect(screen.getByText('50')).toBeInTheDocument();
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

    it('初期HPを変更した戦闘でも残量の割合で幅が決まる', () => {
      expect(renderGaugeFill(200, 200).style.width).toBe('100%');
      expect(renderGaugeFill(100, 200).style.width).toBe('50%');
    });
  });

  describe('イベントフィードバック', () => {
    it.each([
      { judgement: '回避成功', result: 'PERFECT_DODGE', message: 'PERFECT DODGE' },
      { judgement: 'ガード成功', result: 'JUST_GUARD', message: 'JUST GUARD' },
      { judgement: '早押し', result: 'TOO_EARLY', message: 'TOO EARLY' },
      { judgement: '受付外の防御', result: 'MISS', message: 'HIT' },
    ] as const)('$judgement をプレイヤーへ $message として知らせる', ({ result, message }) => {
      useGameStore.setState({ eventFeedback: { kind: 'RESULT', result, attackId: null } });

      render(<Hud />);

      expect(screen.getByText(message)).toBeInTheDocument();
    });

    it('あくび衝撃波の被弾ではDROWSY!を表示する', () => {
      useGameStore.setState({
        eventFeedback: { kind: 'RESULT', result: 'HIT', attackId: 'YAWN_WAVE' },
      });

      render(<Hud />);

      expect(screen.getByText('DROWSY!')).toBeInTheDocument();
    });

    it('ふかふか布団の被弾ではGOOD NIGHTを表示する', () => {
      useGameStore.setState({
        eventFeedback: { kind: 'RESULT', result: 'HIT', attackId: 'FLUFFY_FUTON' },
      });

      render(<Hud />);

      expect(screen.getByText('GOOD NIGHT')).toBeInTheDocument();
    });

    it('反撃Window外の攻撃ではWHIFFを表示する', () => {
      useGameStore.setState({ eventFeedback: { kind: 'REJECTION', reason: 'WHIFF' } });

      render(<Hud />);

      expect(screen.getByText('WHIFF')).toBeInTheDocument();
    });

    it('反撃成立中はCOUNTER!を表示する', () => {
      useGameStore.setState({ eventFeedback: { kind: 'COUNTER' } });

      render(<Hud />);

      expect(screen.getByText('COUNTER!')).toBeInTheDocument();
    });

    // 判定時の技IDをイベントへ畳み込んでいるので、あとから別の技が始まっても
    // 表示済みの結果が新しい技の文言へ化けない (UI-008)。
    it('被弾の文言は判定時の技で決まり、次の技が始まっても変わらない', () => {
      useGameStore.setState({
        lastAttackId: 'YAWN_WAVE',
        eventFeedback: { kind: 'RESULT', result: 'HIT', attackId: 'YAWN_WAVE' },
      });

      const { rerender } = render(<Hud />);
      act(() => useGameStore.setState({ lastAttackId: 'FLUFFY_FUTON' }));
      rerender(<Hud />);

      expect(screen.getByText('DROWSY!')).toBeInTheDocument();
      expect(screen.queryByText('GOOD NIGHT')).not.toBeInTheDocument();
    });

    it('次の技が始まったら前の技のイベント表示を消す', () => {
      const { rerender } = render(<Hud />);

      act(() => useGameStore.getState().recordResult('PERFECT_DODGE'));
      rerender(<Hud />);
      expect(screen.getByText('PERFECT DODGE')).toBeInTheDocument();

      act(() => useGameStore.getState().recordAttack('FLUFFY_FUTON'));
      rerender(<Hud />);

      expect(screen.queryByText('PERFECT DODGE')).not.toBeInTheDocument();
    });

    it('イベント表示は所定時間後に消える', () => {
      useGameStore.setState({
        eventFeedback: { kind: 'RESULT', result: 'PERFECT_DODGE', attackId: null },
      });

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
