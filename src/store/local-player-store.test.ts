import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTER_IDS } from '@/game/config/phase2-player-balance';

import {
  characterIdOf,
  coversAllCharacters,
  DEFAULT_LOCAL_PLAYER_ID,
  isLocalPlayerId,
  isSelectable,
  LOCAL_PLAYER_IDS,
  readLocalPlayerId,
  useLocalPlayerStore,
} from './local-player-store';

beforeEach(() => {
  useLocalPlayerStore.setState({ localPlayerId: DEFAULT_LOCAL_PLAYER_ID, statuses: {} });
});

describe('local-player-store', () => {
  it('既定はオドルノ。切り替え前の挙動を変えない', () => {
    expect(readLocalPlayerId()).toBe('odoruno');
  });

  it('3人のキャラクターを過不足なく覆う', () => {
    expect(coversAllCharacters()).toBe(true);
    expect(LOCAL_PLAYER_IDS.map(characterIdOf)).toEqual([...CHARACTER_IDS]);
  });

  it('切り替えた結果を再レンダーなしで読める', () => {
    useLocalPlayerStore.getState().setLocalPlayerId('pay');

    expect(readLocalPlayerId()).toBe('pay');
    expect(characterIdOf(readLocalPlayerId())).toBe('PAY');
  });

  it('roster外のIDを弾く', () => {
    expect(isLocalPlayerId('ora')).toBe(true);
    expect(isLocalPlayerId('ORA')).toBe(false);
    expect(isLocalPlayerId('hori')).toBe(false);
    expect(isLocalPlayerId(null)).toBe(false);
  });

  it('寝ているキャラは選べない', () => {
    expect(isSelectable({ pay: 'ACTIVE' }, 'pay')).toBe(true);
    expect(isSelectable({ pay: 'FALLING_ASLEEP' }, 'pay')).toBe(false);
    expect(isSelectable({ pay: 'ASLEEP' }, 'pay')).toBe(false);
  });

  it('状態が分からないうちは選べる扱いにする', () => {
    expect(isSelectable({}, 'ora')).toBe(true);
  });
});
