import { describe, expect, it } from 'vitest';

import { routeForLocation, type AppRoute } from './route';

function location(pathname: string, search = '') {
  return { pathname, search };
}

describe('画面 URL の対応', () => {
  it.each([
    ['/', 'TITLE'],
    ['/battle', 'BATTLE'],
    ['/world', 'WORLD'],
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
