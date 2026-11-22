import type { APIRoute } from 'astro';
import { env, error, guard, passthrough, preflight } from '../../../lib/proxy';

export const prerender = false;

const UPSTREAM = 'https://api.typesafe.ai';

// Rutas admitidas → ruta real de la API de TypeSafe.
// `/api/jev` es un atajo de `/api/jev/v1/systemone`.
const ROUTES: Record<string, { method: 'GET' | 'POST'; path: string }> = {
  '': { method: 'POST', path: '/v1/systemone' },
  'v1/systemone': { method: 'POST', path: '/v1/systemone' },
  'v1/models': { method: 'GET', path: '/v1/models' },
};

export const OPTIONS: APIRoute = () => preflight();

export const ALL: APIRoute = async ({ request, params }) => {
  const route = ROUTES[params.path ?? ''];
  if (!route) return error(404, 'Ruta no disponible. Usa POST /api/jev o GET /api/jev/v1/models.');
  if (request.method !== route.method) return error(405, `Esta ruta solo admite ${route.method}.`);

  const blocked = await guard(request, 'jev');
  if (blocked) return blocked;

  if (!env.TYPESAFE_API_KEY) return error(500, 'El servidor no tiene configurado TYPESAFE_API_KEY.');

  const headers = new Headers({ authorization: `Bearer ${env.TYPESAFE_API_KEY}` });
  let body: BodyInit | undefined;

  if (route.method === 'POST') {
    const encoding = request.headers.get('content-encoding');

    if (encoding) {
      // El SDK oficial comprime el cuerpo (zstd/gzip): se reenvía sin tocar.
      headers.set('content-encoding', encoding);
      headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
      body = await request.arrayBuffer();
    } else {
      let payload: Record<string, unknown>;
      try {
        payload = await request.json();
      } catch {
        return error(400, 'El cuerpo de la petición debe ser JSON válido.');
      }
      // Con fetch a pelo no hace falta indicar el modelo: usamos el del taller
      payload.model ??= env.JEV_DEFAULT_MODEL ?? 'jev-latest';
      headers.set('content-type', 'application/json');
      body = JSON.stringify(payload);
    }
  }

  const upstream = await fetch(UPSTREAM + route.path, { method: route.method, headers, body });
  return passthrough(upstream);
};
