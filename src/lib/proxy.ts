import { env as cfEnv } from 'cloudflare:workers';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkshopEnv {
  WORKSHOP_TOKEN?: string;
  OPENAI_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
  JEV_DEFAULT_MODEL?: string;
  RATE_LIMITER?: RateLimiter;
  RATE_LIMITER_MINUTE?: RateLimiter;
  RATE_LIMITER_JEV?: RateLimiter;
  RATE_LIMITER_JEV_MINUTE?: RateLimiter;
}

export const env = cfEnv as unknown as WorkshopEnv;

/** Tamaño máximo del cuerpo de una petición a las APIs del taller. */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * Límites por IP, de la ventana corta a la larga. Jev tiene sus propios contadores (y algo más
 * de margen), separados de los de OpenAI. `period` en segundos: debe coincidir con `ratelimits`
 * en wrangler.jsonc (se usa para el Retry-After del 429).
 */
const RATE_LIMITS = {
  default: [
    { binding: 'RATE_LIMITER', period: 10, message: 'Has superado las 10 peticiones en 10 s.' },
    { binding: 'RATE_LIMITER_MINUTE', period: 60, message: 'Has superado las 30 peticiones por minuto.' },
  ],
  jev: [
    { binding: 'RATE_LIMITER_JEV', period: 10, message: 'Has superado las 15 peticiones a Jev en 10 s.' },
    { binding: 'RATE_LIMITER_JEV_MINUTE', period: 60, message: 'Has superado las 50 peticiones a Jev por minuto.' },
  ],
} as const;

export type RateLimitProfile = keyof typeof RATE_LIMITS;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  // Para que el código del navegador (y los SDK) puedan leer cuánto esperar tras un 429
  'Access-Control-Expose-Headers': 'Retry-After',
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(data: unknown, status = 200): Response {
  return withCors(Response.json(data, { status }));
}

export function error(status: number, message: string, type = 'workshop_error'): Response {
  // Mismo formato que los errores de OpenAI, para que los SDK los muestren bien
  return json({ error: { message, type, code: status } }, status);
}

/** Token interno del taller. No se expone en el cliente: la gente lo escribe en la web y se guarda en localStorage. */
const INTERNAL_WORKSHOP_TOKEN = 'MIDUG';

export function isValidToken(token: string): boolean {
  return token.trim().toUpperCase() === INTERNAL_WORKSHOP_TOKEN;
}

/**
 * Comprueba el token del taller y el límite de peticiones.
 * Devuelve una Response si hay que cortar la petición, o null si puede continuar.
 */
export async function guard(request: Request, profile: RateLimitProfile = 'default'): Promise<Response | null> {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!isValidToken(token)) {
    return error(
      401,
      'Token del taller no válido. Introduce el token del taller en la web o envía "Authorization: Bearer <TOKEN>".',
      'invalid_token',
    );
  }

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    return error(413, `La petición supera el máximo de ${MAX_BODY_BYTES / 1024} KB.`);
  }

  // En local (astro dev) no hay límite de peticiones: solo se aplica en el deploy
  if (import.meta.env.DEV) return null;

  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  for (const { binding, period, message } of RATE_LIMITS[profile]) {
    const limiter = env[binding];
    if (!limiter) continue;
    const { success } = await limiter.limit({ key: ip });
    if (!success) {
      const response = error(429, `${message} Espera ${period} s y vuelve a intentarlo.`, 'rate_limit');
      // El SDK de OpenAI reintenta solo respetando Retry-After
      response.headers.set('retry-after', String(period));
      return response;
    }
  }

  return null;
}

/** Reenvía la respuesta del proveedor tal cual (incluido el streaming) añadiendo CORS. */
export function passthrough(upstream: Response): Response {
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'retry-after']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return withCors(new Response(upstream.body, { status: upstream.status, headers }));
}
