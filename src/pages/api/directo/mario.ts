import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { APIRoute } from 'astro';
import { decide } from '../../../lib/directo/jev/mario-policy.ts';
import type { JevState } from '../../../lib/directo/mario/state.ts';
import { env, guard } from '../../../lib/proxy';

export const prerender = false;

const JEV_BASE_URL = 'https://api.typesafe.ai';
const LAYA_BASE_URL = process.env.LAYA_BASE_URL || 'http://127.0.0.1:8000';

const clients = new Map<string, TypeSafeClient>();

function clientFor(backend: 'jev' | 'laya'): TypeSafeClient {
	const existing = clients.get(backend);
	if (existing) return existing;
	const client = new TypeSafeClient({
		apiKey: env.TYPESAFE_API_KEY,
		baseURL: backend === 'laya' ? LAYA_BASE_URL : JEV_BASE_URL,
		// laya-serve only reads plain JSON: a zstd body (the SDK default from 0.7) is a 400.
		compression: backend === 'laya' ? false : undefined,
	});
	clients.set(backend, client);
	return client;
}

export const POST: APIRoute = async ({ request }) => {
	// Con el token del taller y los límites de Jev, como /api/jev
	const blocked = await guard(request, 'jev');
	if (blocked) return blocked;
	const body = (await request.json().catch(() => null)) as { state?: JevState; backend?: string } | null;
	if (!body?.state || typeof body.state !== 'object') {
		return Response.json({ error: 'Missing state' }, { status: 400 });
	}
	if (body.backend !== 'jev' && body.backend !== 'laya') {
		return Response.json({ error: 'Backend must be jev or laya' }, { status: 400 });
	}
	try {
		return Response.json(await decide(clientFor(body.backend), body.state, request.signal, body.backend));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return Response.json({ error: message }, { status: 502 });
	}
};
