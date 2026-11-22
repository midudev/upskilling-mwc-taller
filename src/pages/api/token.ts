import type { APIRoute } from 'astro';
import { guard, json, preflight } from '../../lib/proxy';

export const prerender = false;

export const OPTIONS: APIRoute = () => preflight();

export const POST: APIRoute = async ({ request }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  return json({ ok: true });
};
