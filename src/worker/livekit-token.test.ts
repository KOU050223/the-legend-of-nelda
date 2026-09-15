import { describe, expect, it } from 'vitest';

import { corsHeaders, createLiveKitAccessToken, parseLiveKitTokenRequest } from './livekit-token';
import worker from '../../worker/index';

function decodePayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1];
  if (encoded === undefined) throw new Error('JWT payload is missing');
  const padded = encoded
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const payload: unknown = JSON.parse(atob(padded));
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('JWT payload must be an object');
  }
  return Object.fromEntries(Object.entries(payload));
}

describe('parseLiveKitTokenRequest', () => {
  it('room・identity・Roleが揃うリクエストだけを受理する', () => {
    expect(
      parseLiveKitTokenRequest({
        roomName: 'nelda-demo',
        playerId: 'participant-123',
        role: 'PAY',
      }),
    ).toEqual({ roomName: 'nelda-demo', playerId: 'participant-123', role: 'PAY' });
  });

  it.each([
    {},
    { roomName: 'room', playerId: 'player', role: 'UNKNOWN' },
    { roomName: 'room name', playerId: 'player', role: 'ORA' },
    { roomName: 'room', playerId: 'player', role: 'ORA', extra: true },
  ])('不要な値や不正なRoleを受理しない: %j', (body) => {
    expect(parseLiveKitTokenRequest(body)).toBeNull();
  });
});

describe('createLiveKitAccessToken', () => {
  it('PAYにはDataだけ、ODORUNOにはMicrophoneとDataを許可する短命JWTを発行する', async () => {
    const pay = decodePayload(
      await createLiveKitAccessToken(
        { roomName: 'nelda-demo', playerId: 'participant-pay', role: 'PAY' },
        'api-key',
        'api-secret',
        1_000,
      ),
    );
    const odoruno = decodePayload(
      await createLiveKitAccessToken(
        { roomName: 'nelda-demo', playerId: 'participant-odoruno', role: 'ODORUNO' },
        'api-key',
        'api-secret',
        1_000,
      ),
    );

    expect(pay).toMatchObject({ iss: 'api-key', sub: 'participant-pay', exp: 1_900 });
    expect(pay.video).toMatchObject({ canPublishSources: ['data'] });
    expect(odoruno.video).toMatchObject({ canPublishSources: ['microphone', 'data'] });
  });
});

describe('corsHeaders', () => {
  it('同一Originと明示許可した開発Originだけを許可する', () => {
    const sameOrigin = new Request('https://nelda.example/api/livekit/token', {
      headers: { Origin: 'https://nelda.example' },
    });
    const allowedOrigin = new Request('https://nelda.example/api/livekit/token', {
      headers: { Origin: 'https://localhost:5173' },
    });
    const deniedOrigin = new Request('https://nelda.example/api/livekit/token', {
      headers: { Origin: 'https://untrusted.example' },
    });
    const env = { LIVEKIT_TOKEN_ALLOWED_ORIGINS: 'https://localhost:5173' };

    expect(corsHeaders(sameOrigin, env)).toMatchObject({
      'access-control-allow-origin': 'https://nelda.example',
    });
    expect(corsHeaders(allowedOrigin, env)).toMatchObject({
      'access-control-allow-origin': 'https://localhost:5173',
    });
    expect(corsHeaders(deniedOrigin, env)).toEqual({});
  });
});

describe('LiveKit token Worker', () => {
  const assets = { fetch: async () => new Response('asset') };

  it('設定済みSecretで短命の接続Tokenだけを返す', async () => {
    const response = await worker.fetch(
      new Request('https://nelda.example/api/livekit/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: 'https://nelda.example' },
        body: JSON.stringify({ roomName: 'nelda-demo', playerId: 'participant-pay', role: 'PAY' }),
      }),
      {
        ASSETS: assets,
        LIVEKIT_URL: 'wss://nelda.livekit.cloud',
        LIVEKIT_API_KEY: 'api-key',
        LIVEKIT_API_SECRET: 'api-secret',
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body: unknown = await response.json();
    expect(body).toMatchObject({ url: 'wss://nelda.livekit.cloud' });
    if (typeof body !== 'object' || body === null || !('token' in body)) {
      throw new Error('token response was malformed');
    }
    expect(typeof body.token).toBe('string');
  });

  it('Secret未設定ではTokenを発行しない', async () => {
    const response = await worker.fetch(
      new Request('https://nelda.example/api/livekit/token', { method: 'POST', body: '{}' }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(503);
  });
});
