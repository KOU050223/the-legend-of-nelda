import { describe, expect, it } from 'vitest';

import { normalizeOraSpeechIntensity } from '@/input/ora/ora-production-input';

import {
  classifyMarkerlessMediaError,
  formatMarkerlessHand,
  labelForMarkerlessMediaStatus,
  normalizeMarkerlessSpeechIntensity,
  rmsFromSamples,
} from './markerless-debug-helpers';

describe('Markerless debug の表示用ヘルパー', () => {
  it.each([
    { status: 'idle' as const, label: '未開始' },
    { status: 'requesting-permission' as const, label: '許可待ち' },
    { status: 'active' as const, label: '動作中' },
    { status: 'permission-denied' as const, label: '拒否' },
    { status: 'error' as const, label: 'エラー' },
  ])('$status を「$label」と表示する', ({ status, label }) => {
    expect(labelForMarkerlessMediaStatus(status)).toBe(label);
  });

  it('NotAllowedErrorとSecurityErrorを権限拒否として分類する', () => {
    expect(classifyMarkerlessMediaError(new DOMException('denied', 'NotAllowedError'))).toBe(
      'permission-denied',
    );
    expect(classifyMarkerlessMediaError(new DOMException('blocked', 'SecurityError'))).toBe(
      'permission-denied',
    );
  });

  it('その他の失敗を一般エラーとして分類する', () => {
    expect(classifyMarkerlessMediaError(new Error('failed'))).toBe('error');
    expect(classifyMarkerlessMediaError('failed')).toBe('error');
  });

  it('音声サンプルからRMSを計算する', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0]);

    expect(rmsFromSamples(samples)).toBeCloseTo(0.353553);
    expect(rmsFromSamples(new Float32Array())).toBe(0);
  });

  it('本番と同じオラ用の通常発話スケールを使う', () => {
    expect(normalizeMarkerlessSpeechIntensity).toBe(normalizeOraSpeechIntensity);
    expect(normalizeMarkerlessSpeechIntensity(0.02)).toBeCloseTo(0.230769, 5);
    expect(normalizeMarkerlessSpeechIntensity(0.06)).toBe(1);
  });

  it('両手の座標、速度、開閉状態を表示用文字列へ変換する', () => {
    expect(
      formatMarkerlessHand({ x: 0.25, y: 0.5, velocityX: -0.1, velocityY: 0.2, isOpen: true }),
    ).toBe('x 0.25 / y 0.50 / vx -0.10 / vy 0.20 / OPEN');
    expect(formatMarkerlessHand(undefined)).toBe('未検出');
  });
});
