/** Cloudflare Workerで発行するLiveKit接続Token。ブラウザ用bundleからはimportしない。 */

export type LiveKitRole = 'ODORUNO' | 'PAY' | 'ORA';

export interface LiveKitTokenRequestBody {
  roomName: string;
  playerId: string;
  role: LiveKitRole;
}

export interface LiveKitTokenEnv {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_TOKEN_ALLOWED_ORIGINS?: string;
}

const encoder = new TextEncoder();
const TOKEN_TTL_SECONDS = 15 * 60;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is LiveKitRole {
  return value === 'ODORUNO' || value === 'PAY' || value === 'ORA';
}

export function parseLiveKitTokenRequest(value: unknown): LiveKitTokenRequestBody | null {
  if (!isRecord(value)) return null;
  const body = value;
  if (Object.keys(body).length !== 3) return null;
  if (
    !isValidIdentifier(body.roomName) ||
    !isValidIdentifier(body.playerId) ||
    !isRole(body.role)
  ) {
    return null;
  }
  return { roomName: body.roomName, playerId: body.playerId, role: body.role };
}

function permissionsFor(role: LiveKitRole): {
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  canPublishSources: readonly string[];
} {
  if (role === 'PAY') {
    return {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ['data'],
    };
  }
  return {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: ['microphone', 'data'],
  };
}

/**
 * LiveKit Access Token (HS256)をWorkers標準Web Cryptoだけで署名する。
 * API Secretは引数でのみ受け、レスポンス・ログ・例外へ含めない。
 */
export async function createLiveKitAccessToken(
  request: LiveKitTokenRequestBody,
  apiKey: string,
  apiSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: apiKey,
        sub: request.playerId,
        nbf: nowSeconds,
        exp: nowSeconds + TOKEN_TTL_SECONDS,
        name: request.playerId,
        metadata: JSON.stringify({ role: request.role }),
        video: {
          roomJoin: true,
          room: request.roomName,
          ...permissionsFor(request.role),
        },
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export function corsHeaders(request: Request, env: LiveKitTokenEnv): HeadersInit {
  const origin = request.headers.get('Origin');
  if (origin === null) return {};
  const sameOrigin = origin === new URL(request.url).origin;
  const allowedOrigins = new Set(
    (env.LIVEKIT_TOKEN_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== ''),
  );
  if (!sameOrigin && !allowedOrigins.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}
