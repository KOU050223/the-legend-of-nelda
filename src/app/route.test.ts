import { describe, expect, it } from 'vitest';

import { navigateToScreen, routeForLocation, type AppRoute } from './route';

function location(pathname: string, search = '') {
  return { pathname, search };
}

describe('画面 URL の対応', () => {
  it('INTRO/TITLE/MATCHING/GAMEの遷移で共有tokenを保持する', () => {
    window.history.replaceState({}, '', '/intro?token=shared-room-token');

    navigateToScreen('MATCHING');

    expect(window.location.pathname).toBe('/matching');
    expect(window.location.search).toBe('?token=shared-room-token');
  });

  it.each([
    ['a+b', '?token=a%2Bb'],
    ['a%2Bb', '?token=a%2Bb'],
  ])('tokenの%sをINTRO/MATCHING/GAME遷移で論理値の+として保持する', (token, expectedSearch) => {
    for (const screen of ['INTRO', 'MATCHING', 'GAME'] as const) {
      window.history.replaceState({}, '', `/battle?token=${token}`);

      navigateToScreen(screen);

      expect(window.location.search).toBe(expectedSearch);
    }
  });

  it.each([
    ['/', 'TITLE'],
    ['/intro', 'INTRO'],
    ['/battle', 'BATTLE'],
    ['/world', 'WORLD'],
    ['/matching', 'MATCHING'],
    ['/game', 'GAME'],
    ['/debug/ora', 'ORA_DEBUG'],
  ] as const)('「%s」は %s を開く', (pathname, expected: AppRoute) => {
    expect(routeForLocation(location(pathname))).toBe(expected);
  });

  it('従来のデバッグ用クエリを対応する画面として解釈する', () => {
    expect(routeForLocation(location('/', '?scene=world'))).toBe('WORLD');
    expect(routeForLocation(location('/', '?debug=ora'))).toBe('ORA_DEBUG');
  });

  it('未知の URL はタイトルへ戻す', () => {
    expect(routeForLocation(location('/unknown'))).toBe('TITLE');
  });
});
