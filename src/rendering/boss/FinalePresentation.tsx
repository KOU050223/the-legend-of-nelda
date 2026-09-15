import { useSyncExternalStore } from 'react';

import {
  getFinalePresentationSnapshot,
  subscribeToFinalePresentation,
} from './finale-presentation-store';
import { FinaleOverlay } from './FinaleOverlay';

/** Canvas外で最終演出を描くDOMレイヤー。R3FのツリーへDOMを混ぜない。 */
export function FinalePresentation(): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    subscribeToFinalePresentation,
    getFinalePresentationSnapshot,
    getFinalePresentationSnapshot,
  );

  return <FinaleOverlay {...snapshot} />;
}
