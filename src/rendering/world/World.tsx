import { Ground } from './Ground';

export interface WorldProps {
  groundSize?: number;
}

/**
 * 3Dワールドの基盤。現状は Ground のみを持つ。
 * 将来 Map GLB へ差し替えるときも、この Component 境界の内側だけを
 * 変更すればよい状態にする (Issue #41)。
 */
export function World({ groundSize }: WorldProps): React.JSX.Element {
  return groundSize === undefined ? <Ground /> : <Ground size={groundSize} />;
}
