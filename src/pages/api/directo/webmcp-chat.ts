import type { APIRoute } from 'astro'
import { limitOpenAIRequest, MAX_REASONING_EFFORT, OPENAI_MODEL } from '../../../lib/openai-limits'
import { env, guard } from '../../../lib/proxy'

export const prerender = false

const DEFAULT_REASONING = MAX_REASONING_EFFORT
const RESPONSES_URL = 'https://api.openai.com/v1/responses'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Chat Completions tools → formato plano de Responses API. */
function toResponsesTools(tools: unknown[]): unknown[] {
  return tools.map((raw) => {
    const t = raw as Record<string, any>
    if (t?.type === 'function' && t.function) {
      return {
        type: 'function',
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters ?? { type: 'object', properties: {} },
        strict: false,
      }
    }
    return t
  })
}

/**
 * Convierte historial estilo Chat Completions (system/user/assistant/tool)
 * al input + instructions de la Responses API.
 */
function chatMessagesToResponses(messages: any[]): {
  instructions?: string
  input: unknown[]
} {
  let instructions: string | undefined
  const input: unknown[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      const text = typeof m.content === 'string' ? m.content : ''
      instructions = instructions ? `${instructions}\n\n${text}` : text
      continue
    }

    if (m.role === 'user') {
      input.push({ role: 'user', content: m.content ?? '' })
      continue
    }

    if (m.role === 'assistant') {
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        if (m.content) {
          input.push({ role: 'assistant', content: m.content })
        }
        for (const tc of m.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function?.name,
            arguments: tc.function?.arguments || '{}',
          })
        }
      } else {
        input.push({ role: 'assistant', content: m.content ?? '' })
      }
      continue
    }

    if (m.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output:
          typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content ?? ''),
      })
    }
  }

  return { instructions, input }
}

/** Respuesta de Responses API → mensaje estilo Chat Completions (para los clientes). */
function responsesToChatMessage(data: any) {
  const output: any[] = data.output ?? []

  let content =
    typeof data.output_text === 'string' && data.output_text.length > 0
      ? data.output_text
      : output
          .filter((item) => item.type === 'message')
          .flatMap((item) => item.content ?? [])
          .filter((c: any) => c.type === 'output_text' || c.type === 'text')
          .map((c: any) => c.text ?? '')
          .join('')

  const tool_calls = output
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      id: item.call_id,
      type: 'function' as const,
      function: {
        name: item.name,
        arguments: item.arguments || '{}',
      },
    }))

  return {
    role: 'assistant' as const,
    content: content || null,
    ...(tool_calls.length > 0 ? { tool_calls } : {}),
  }
}

export const POST: APIRoute = async ({ request }) => {
  // Con el token del taller, como el resto de las APIs
  const blocked = await guard(request)
  if (blocked) return blocked
  try {
    // El modelo lo fija el servidor: se ignora el que mande el cliente
    const { messages, tools, reasoning_effort } = (await request.json()) as {
      messages?: unknown
      tools?: unknown
      reasoning_effort?: string
    }

    if (!Array.isArray(messages)) {
      return json({ error: 'Faltan los mensajes de la conversación.' }, 400)
    }

    const apiKey = env.OPENAI_API_KEY
    if (!apiKey) {
      return json({ error: 'OPENAI_API_KEY no configurada en el servidor.' }, 500)
    }

    const { instructions, input } = chatMessagesToResponses(messages)
    const body: Record<string, unknown> = {
      model: OPENAI_MODEL,
      reasoning: { effort: reasoning_effort || DEFAULT_REASONING },
      input,
      store: false,
    }
    if (instructions) body.instructions = instructions

    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = toResponsesTools(tools)
      body.tool_choice = 'auto'
    }

    // Los mismos límites que /api/openai: razonamiento, tokens de salida, herramientas, imágenes…
    const limited = limitOpenAIRequest('responses', body)
    if (limited) return json({ error: limited.message }, 400)

    const upstream = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!upstream.ok) {
      const errorText = await upstream.text()
      return json({ error: `HTTP ${upstream.status}: ${errorText}` }, upstream.status)
    }

    const data = await upstream.json()
    const message = responsesToChatMessage(data)

    if (!message.content && !message.tool_calls?.length) {
      return json({ error: 'El modelo no devolvió ningún mensaje.' }, 502)
    }

    return json({ message })
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 500)
  }
}
