import {
  corsHeaders,
  createLiveKitAccessToken,
  parseLiveKitTokenRequest,
  type LiveKitTokenEnv,
} from '../src/worker/livekit-token';

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env extends LiveKitTokenEnv {
  ASSETS: AssetFetcher;
}

const TOKEN_PATH = '/api/livekit/token';

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('cache-control', 'no-store');
  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function isAllowedOrigin(request: Request, headers: HeadersInit): boolean {
  return request.headers.get('Origin') === null || 'access-control-allow-origin' in headers;
}

async function tokenResponse(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (!isAllowedOrigin(request, cors)) return json({ error: 'origin is not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors);
  if (
    env.LIVEKIT_URL === undefined ||
    env.LIVEKIT_API_KEY === undefined ||
    env.LIVEKIT_API_SECRET === undefined
  ) {
    return json({ error: 'voice token service is not configured' }, 503, cors);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400, cors);
  }
  const tokenRequest = parseLiveKitTokenRequest(body);
  if (tokenRequest === null) return json({ error: 'invalid token request' }, 400, cors);

  const token = await createLiveKitAccessToken(
    tokenRequest,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
  return json({ url: env.LIVEKIT_URL, token }, 201, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === TOKEN_PATH) return tokenResponse(request, env);
    return env.ASSETS.fetch(request);
  },
};
