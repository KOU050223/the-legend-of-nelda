import type { HandObservation } from '@/input/ora/types';

export type MarkerlessMediaStatus =
  | 'idle'
  | 'requesting-permission'
  | 'active'
  | 'permission-denied'
  | 'error';

const mediaStatusLabels: Record<MarkerlessMediaStatus, string> = {
  idle: '未開始',
  'requesting-permission': '許可待ち',
  active: '動作中',
  'permission-denied': '拒否',
  error: 'エラー',
};

export function labelForMarkerlessMediaStatus(status: MarkerlessMediaStatus): string {
  return mediaStatusLabels[status];
}

export function classifyMarkerlessMediaError(
  error: unknown,
): Extract<MarkerlessMediaStatus, 'permission-denied' | 'error'> {
  const errorName =
    typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
      ? error.name
      : undefined;
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'permission-denied';
  }
  return 'error';
}

export function rmsFromSamples(samples: Float32Array): number {
  if (samples.length === 0) return 0;

  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function formatMarkerlessHand(hand: HandObservation['left']): string {
  if (!hand) return '未検出';

  const openState = hand.isOpen === undefined ? 'OPEN状態不明' : hand.isOpen ? 'OPEN' : 'CLOSED';
  return `x ${hand.x.toFixed(2)} / y ${hand.y.toFixed(2)} / vx ${hand.velocityX.toFixed(2)} / vy ${hand.velocityY.toFixed(2)} / ${openState}`;
}
