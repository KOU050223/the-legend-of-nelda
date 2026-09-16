import { describe, expect, it } from 'vitest';

import { isOraInputTarget } from './BossArenaScene';

describe('BossArenaSceneのORA入力対象判定', () => {
  it('ローカルのora選択時だけORA入力対象になる', () => {
    expect(isOraInputTarget('ora', false, null)).toBe(true);
    expect(isOraInputTarget('pay', false, null)).toBe(false);
  });

  it('リモートのparticipant IDはsnapshotのcharacterIdでORA入力対象を判定する', () => {
    const players = [
      { id: 'participant-ora', characterId: 'ORA' as const },
      { id: 'participant-pay', characterId: 'PAY' as const },
    ];

    expect(isOraInputTarget('participant-ora', true, players)).toBe(true);
    expect(isOraInputTarget('participant-pay', true, players)).toBe(false);
    expect(isOraInputTarget('participant-ora', true, null)).toBe(false);
  });
});
