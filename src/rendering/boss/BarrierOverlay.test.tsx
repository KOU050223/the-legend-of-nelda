import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BarrierChallengeSnapshot } from '@/game/barrier/barrier-challenge';
import { DEVICE_ANCHORS } from '@/game/arena/arena';

import { BarrierOverlay } from './BarrierOverlay';

function challenge(overrides: Partial<BarrierChallengeSnapshot> = {}): BarrierChallengeSnapshot {
  return {
    phase: 'BARRIER_2',
    devices: [
      { id: 'DEVICE_0', anchor: DEVICE_ANCHORS[0]!, status: 'IDLE' },
      { id: 'DEVICE_1', anchor: DEVICE_ANCHORS[1]!, status: 'IDLE' },
      { id: 'DEVICE_2', anchor: DEVICE_ANCHORS[2]!, status: 'IDLE' },
    ],
    nextStepIndex: 0,
    securedDeviceId: null,
    ...overrides,
  };
}

/** 発動演出を終わらせ、操作案内まで進める。 */
function skipCutscene(): void {
  act(() => {
    vi.advanceTimersByTime(5_000);
  });
}

describe('BarrierOverlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('結界が無いときは何も表示しない', () => {
    const { container } = render(
      <BarrierOverlay challenge={null} localCharacterId="ODORUNO" resetSequence={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('発動直後はボスが無敵になったことを演出で伝える', () => {
    render(<BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" resetSequence={0} />);

    expect(screen.getByText('BOSS INVINCIBLE')).toBeInTheDocument();
    expect(screen.getByText('「睡眠時間など4時間で十分だ！！！」')).toBeInTheDocument();
  });

  it('演出のあとは操作しているキャラ向けの解除手順を出す', () => {
    render(<BarrierOverlay challenge={challenge()} localCharacterId="ORA" resetSequence={0} />);
    skipCutscene();

    expect(screen.getByText('オラ大輔')).toBeInTheDocument();
    expect(screen.getByText('確保された装置の前で、オラ大輔専用入力で起動')).toBeInTheDocument();
    // 別の役割の手順は出さない。
    expect(screen.queryByText('オドルノ大輔')).not.toBeInTheDocument();
  });

  it('役割ごとに案内を変える', () => {
    render(<BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" resetSequence={0} />);
    skipCutscene();

    expect(screen.getByText('装置へ走り、E / INTERACT で現場を確保')).toBeInTheDocument();
  });

  it('装置の状態と進捗を出す', () => {
    render(
      <BarrierOverlay
        challenge={challenge({
          nextStepIndex: 1,
          securedDeviceId: 'DEVICE_0',
          devices: [
            { id: 'DEVICE_0', anchor: DEVICE_ANCHORS[0]!, status: 'SECURED' },
            { id: 'DEVICE_1', anchor: DEVICE_ANCHORS[1]!, status: 'IDLE' },
            { id: 'DEVICE_2', anchor: DEVICE_ANCHORS[2]!, status: 'ACTIVATED' },
          ],
        })}
        localCharacterId="PAY"
        resetSequence={0}
      />,
    );
    skipCutscene();

    expect(screen.getByLabelText('起動済みの装置')).toHaveTextContent('1 / 3');
    expect(screen.getByText('確保 → 起動待ち')).toBeInTheDocument();
    expect(screen.getByText('起動済み')).toBeInTheDocument();
  });

  it('手順を間違えたときだけ、やり直しになったことを出す', () => {
    const { rerender } = render(
      <BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" resetSequence={0} />,
    );
    skipCutscene();

    expect(screen.queryByText('順番が違う！')).not.toBeInTheDocument();

    rerender(
      <BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" resetSequence={1} />,
    );

    expect(screen.getByText('順番が違う！')).toBeInTheDocument();
  });
});
