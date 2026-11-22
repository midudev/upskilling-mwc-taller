import type { APIRoute } from 'astro'
import { MAX_REASONING_EFFORT, OPENAI_MODEL } from '../../../lib/openai-limits'
import { env, guard } from '../../../lib/proxy'

export const prerender = false

/**
 * Abre una sesión de GPT-Live por WebRTC para el asistente del Camp Nou.
 *
 * El navegador manda su oferta SDP y los prompts (se generan en la página con el
 * calendario de hoy); el servidor añade la clave y crea la sesión con
 * `POST /v1/live/sessions`. GPT-Live lleva la conversación y delega en gpt-6-luna
 * (Responses), que llama a la herramienta WebMCP del formulario. Esa herramienta
 * la ejecuta la página: llega por el canal de datos y vuelve con `response.item.create`.
 */

const LIVE_URL = 'https://api.openai.com/v1/live/sessions'
const LIVE_MODEL = 'gpt-live-1'
const BACKEND_MODEL = OPENAI_MODEL
const VOICE = 'marin'

const MAX_SDP = 64 * 1024
const MAX_PROMPT = 48 * 1024

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Body = {
  sdp?: unknown
  instructions?: unknown
  backendInstructions?: unknown
  greeting?: unknown
  tools?: unknown
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export const POST: APIRoute = async ({ request }) => {
  // Con el token del taller, como el resto de las APIs
  const blocked = await guard(request)
  if (blocked) return blocked

  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'OPENAI_API_KEY no configurada en el servidor.' }, 500)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: 'JSON no válido.' }, 400)
  }

  const { sdp, instructions, backendInstructions, greeting, tools } = body
  if (!isText(sdp, MAX_SDP)) return json({ error: 'Falta la oferta SDP.' }, 400)
  if (!isText(instructions, MAX_PROMPT) || !isText(backendInstructions, MAX_PROMPT)) {
    return json({ error: 'Faltan las instrucciones de la sesión.' }, 400)
  }
  if (!Array.isArray(tools) || tools.length > 8 || JSON.stringify(tools).length > MAX_PROMPT) {
    return json({ error: 'Herramientas no válidas.' }, 400)
  }

  const session = {
    model: LIVE_MODEL,
    instructions,
    audio: { output: { voice: VOICE } },
    // El saludo va también aquí: así está disponible desde el primer momento.
    input: isText(greeting, 2000) ? [{ role: 'developer', content: [{ type: 'input_text', text: greeting }] }] : [],
    delegation: {
      type: 'responses',
      responses: {
        model: BACKEND_MODEL,
        instructions: backendInstructions,
        tools: tools.map((raw) => {
          const t = raw as Record<string, unknown>
          return {
            type: 'function',
            name: String(t.name ?? ''),
            description: typeof t.description === 'string' ? t.description : undefined,
            parameters: t.parameters ?? { type: 'object', properties: {} },
            strict: false,
          }
        }),
        tool_choice: 'auto',
        // El formulario es uno: una llamada cada vez.
        parallel_tool_calls: false,
        reasoning: { effort: MAX_REASONING_EFFORT },
      },
    },
  }

  try {
    const upstream = await fetch(LIVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ session, transport: { type: 'webrtc', sdp } }),
    })

    if (!upstream.ok) {
      const errorText = await upstream.text()
      return json({ error: `GPT-Live ${upstream.status}: ${errorText.slice(0, 600)}` }, upstream.status)
    }

    // { session: { id }, transport: { type: 'webrtc', sdp } }
    return json(await upstream.json(), 201)
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 502)
  }
}
