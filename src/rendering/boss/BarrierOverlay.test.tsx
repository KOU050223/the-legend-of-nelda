import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEVICE_ANCHORS } from '@/game/arena/arena';
import type { BarrierChallengeSnapshot } from '@/game/barrier/barrier-challenge';

import { BarrierOverlay } from './BarrierOverlay';

function challenge(overrides: Partial<BarrierChallengeSnapshot> = {}): BarrierChallengeSnapshot {
  const devices = overrides.devices ?? [
    { id: 'DEVICE_0', anchor: DEVICE_ANCHORS[0]!, status: 'IDLE' },
    { id: 'DEVICE_1', anchor: DEVICE_ANCHORS[1]!, status: 'IDLE' },
    { id: 'DEVICE_2', anchor: DEVICE_ANCHORS[2]!, status: 'IDLE' },
  ];

  return {
    phase: 'BARRIER_1',
    devices,
    occupiedCount: devices.filter((device) => device.status === 'OCCUPIED').length,
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
    const { container } = render(<BarrierOverlay challenge={null} localCharacterId="ODORUNO" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('発動直後はボスが無敵になったことを演出で伝える', () => {
    render(<BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" />);

    expect(screen.getByText('BOSS INVINCIBLE')).toBeInTheDocument();
    expect(screen.getByText('「睡眠時間など4時間で十分だ！！！」')).toBeInTheDocument();
    expect(screen.getByText('オレンジの円に3人で入れ！')).toBeInTheDocument();
  });

  it('演出のあとは「円に入る」という解除方法を出す', () => {
    render(<BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" />);
    skipCutscene();

    expect(screen.getByText('オレンジの円に入って結界を解け')).toBeInTheDocument();
    expect(screen.getByText('オレンジの光の柱へ走って、中に立つ')).toBeInTheDocument();
  });

  it('埋まっている円の数を出す', () => {
    render(
      <BarrierOverlay
        challenge={challenge({
          devices: [
            { id: 'DEVICE_0', anchor: DEVICE_ANCHORS[0]!, status: 'OCCUPIED' },
            { id: 'DEVICE_1', anchor: DEVICE_ANCHORS[1]!, status: 'IDLE' },
            { id: 'DEVICE_2', anchor: DEVICE_ANCHORS[2]!, status: 'OCCUPIED' },
          ],
        })}
        localCharacterId="ORA"
      />,
    );
    skipCutscene();

    expect(screen.getByLabelText('埋まっている円')).toHaveTextContent('2 / 3');
    expect(screen.getAllByText('誰かいる')).toHaveLength(2);
    expect(screen.getByText('空いている')).toBeInTheDocument();
  });

  it('役割によらず同じ解除方法を出す', () => {
    const { rerender } = render(
      <BarrierOverlay challenge={challenge()} localCharacterId="ODORUNO" />,
    );
    skipCutscene();
    expect(screen.getByText(/水色の安全地帯ではない/)).toBeInTheDocument();

    rerender(<BarrierOverlay challenge={challenge()} localCharacterId="PAY" />);
    expect(screen.getByText(/水色の安全地帯ではない/)).toBeInTheDocument();
  });
});
