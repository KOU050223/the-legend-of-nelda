import { describe, expect, it } from 'vitest';

import { decodeWasshoiEvent } from './livekit-voice-session';

const encoder = new TextEncoder();

describe('decodeWasshoiEvent', () => {
  it('許可された発話特徴だけを受信イベントとして取り出す', () => {
    const result = decodeWasshoiEvent(
      encoder.encode('{"type":"WASSHOI","intensity":0.68,"durationMs":840}'),
    );

    expect(result).toEqual({ type: 'WASSHOI', intensity: 0.68, durationMs: 840 });
  });

  it.each([
    '{"type":"WASSHOI","intensity":1.2,"durationMs":840}',
    '{"type":"WASSHOI","intensity":0.5,"durationMs":-1}',
    '{"type":"WASSHOI","transcript":"右へ逃げて"}',
    'not json',
  ])('音声内容や範囲外の特徴を含むデータは再生しない: %s', (payload) => {
    const result = decodeWasshoiEvent(encoder.encode(payload));

    expect(result).toBeNull();
  });
});
