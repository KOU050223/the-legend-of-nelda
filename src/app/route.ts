import type { Screen } from './screen';

export type AppRoute = Screen | 'ORA_DEBUG';

const routePaths: Record<AppRoute, string> = {
  TITLE: '/',
  INTRO: '/intro',
  BATTLE: '/battle',
  WORLD: '/world',
  MATCHING: '/matching',
  GAME: '/game',
  ORA_DEBUG: '/debug/ora',
};

function tokenFromSearch(search: string): string | null {
  for (const parameter of search.slice(1).split('&')) {
    const separatorIndex = parameter.indexOf('=');
    const rawName = separatorIndex === -1 ? parameter : parameter.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : parameter.slice(separatorIndex + 1);

    let name: string;
    try {
      name = decodeURIComponent(rawName.replaceAll('+', '%20'));
    } catch {
      continue;
    }
    if (name !== 'token') continue;

    try {
      return decodeURIComponent(rawValue.replaceAll('+', '%2B'));
    } catch {
      return rawValue;
    }
  }
  return null;
}

export function routeForLocation(location: Pick<Location, 'pathname' | 'search'>): AppRoute {
  if (new URLSearchParams(location.search).get('debug') === 'ora') {
    return 'ORA_DEBUG';
  }

  if (import.meta.env.DEV) {
    if (location.pathname === '/debug/ora') return 'ORA_DEBUG';
    if (
      location.pathname === '/world' ||
      new URLSearchParams(location.search).get('scene') === 'world'
    ) {
      return 'WORLD';
    }
    if (new URLSearchParams(location.search).get('scene') === 'combat') {
      return 'BATTLE';
    }
  }

  if (location.pathname === '/intro') return 'INTRO';
  if (location.pathname === '/battle') return 'BATTLE';
  if (location.pathname === '/matching') return 'MATCHING';
  if (location.pathname === '/game') return 'GAME';
  return 'TITLE';
}

export function pathForScreen(screen: Screen): string {
  return routePaths[screen];
}

export function navigateToScreen(screen: Screen): void {
  if (typeof window === 'undefined') return;

  const path = pathForScreen(screen);
  const token = tokenFromSearch(window.location.search);
  const search = token === null ? '' : `?token=${encodeURIComponent(token)}`;
  if (window.location.pathname !== path || window.location.search !== search) {
    window.history.pushState({}, '', `${path}${search}`);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function currentRoute(): AppRoute {
  if (typeof window === 'undefined') return 'TITLE';
  return routeForLocation(window.location);
}

export function subscribeToRoute(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}
