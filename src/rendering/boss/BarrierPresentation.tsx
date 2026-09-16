import { useSyncExternalStore } from 'react';

import {
  getBarrierPresentationSnapshot,
  subscribeToBarrierPresentation,
} from './barrier-presentation-store';
import { BarrierOverlay } from './BarrierOverlay';

/** Canvas外で結界の演出・案内を描くDOMレイヤー。FinalePresentation と同じ形。 */
export function BarrierPresentation(): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    subscribeToBarrierPresentation,
    getBarrierPresentationSnapshot,
    getBarrierPresentationSnapshot,
  );

  return <BarrierOverlay {...snapshot} />;
}
