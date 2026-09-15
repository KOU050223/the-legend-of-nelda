import type { Screen } from './screen';

export type AppRoute = Screen | 'ORA_DEBUG';

const routePaths: Record<AppRoute, string> = {
  TITLE: '/',
  INTRO: '/intro',
  BATTLE: '/battle',
  WORLD: '/world',
  ORA_DEBUG: '/debug/ora',
};

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
  return 'TITLE';
}

export function pathForScreen(screen: Screen): string {
  return routePaths[screen];
}

export function navigateToScreen(screen: Screen): void {
  if (typeof window === 'undefined') return;

  const path = pathForScreen(screen);
  if (window.location.pathname !== path || window.location.search) {
    window.history.pushState({}, '', path);
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
