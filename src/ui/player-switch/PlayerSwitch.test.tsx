import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_LOCAL_PLAYER_ID, useLocalPlayerStore } from '@/store/local-player-store';

import { PlayerSwitch } from './PlayerSwitch';

beforeEach(() => {
  useLocalPlayerStore.setState({ localPlayerId: DEFAULT_LOCAL_PLAYER_ID, statuses: {} });
});

describe('PlayerSwitch', () => {
  it('3人を出し、既定ではオドルノが選ばれている', () => {
    render(<PlayerSwitch />);

    expect(screen.getByRole('radio', { name: 'オドルノDaisuke' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pay大輔' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'オラ大輔' })).not.toBeChecked();
  });

  it('選び直すと操作対象が切り替わる', () => {
    render(<PlayerSwitch />);

    fireEvent.click(screen.getByRole('radio', { name: 'オラ大輔' }));

    expect(useLocalPlayerStore.getState().localPlayerId).toBe('ora');
  });

  it('寝ているキャラは選べない', () => {
    useLocalPlayerStore.setState({ statuses: { pay: 'ASLEEP' } });
    render(<PlayerSwitch />);

    expect(screen.getByRole('radio', { name: /Pay大輔/ })).toBeDisabled();
  });
});
