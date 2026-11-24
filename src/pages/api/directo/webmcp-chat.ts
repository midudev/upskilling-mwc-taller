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

/** Traduce el stream SSE de OpenAI Responses API a eventos ligeros (delta / done / error). */
function streamResponsesToSse(upstreamBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const reader = upstreamBody.getReader()
      let buffer = ''
      let accText = ''
      const fallbackCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = []
      let finished = false

      const handleEvent = (raw: string) => {
        if (!raw || raw === '[DONE]') return
        let event: any
        try {
          event = JSON.parse(raw)
        } catch {
          return
        }

        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string' && event.delta.length > 0) {
          accText += event.delta
          send({ type: 'delta', delta: event.delta })
          return
        }

        if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
          fallbackCalls.push({
            id: event.item.call_id,
            type: 'function',
            function: {
              name: event.item.name,
              arguments: event.item.arguments || '{}',
            },
          })
          return
        }

        if (event.type === 'response.completed') {
          finished = true
          const message = responsesToChatMessage(event.response ?? {})
          if (!message.content && accText) message.content = accText
          if (!message.tool_calls?.length && fallbackCalls.length) message.tool_calls = fallbackCalls
          send({ type: 'done', message })
          return
        }

        if (event.type === 'response.failed' || event.type === 'error') {
          finished = true
          const msg =
            event.response?.error?.message ??
            event.error?.message ??
            (typeof event.message === 'string' ? event.message : 'Error al generar la respuesta.')
          send({ type: 'error', error: msg })
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            handleEvent(line.slice(5).trim())
          }
        }

        buffer += decoder.decode()
        for (const line of buffer.split(/\r?\n/)) {
          if (line.startsWith('data:')) handleEvent(line.slice(5).trim())
        }

        if (!finished) {
          if (accText || fallbackCalls.length) {
            send({
              type: 'done',
              message: {
                role: 'assistant',
                content: accText || null,
                ...(fallbackCalls.length ? { tool_calls: fallbackCalls } : {}),
              },
            })
          } else {
            send({ type: 'error', error: 'El modelo no devolvió ningún mensaje.' })
          }
        }
      } catch (err: any) {
        if (!finished) send({ type: 'error', error: err?.message ?? String(err) })
      } finally {
        reader.releaseLock()
        controller.close()
      }
    },
  })
}

export const POST: APIRoute = async ({ request }) => {
  // Con el token del taller, como el resto de las APIs
  const blocked = await guard(request)
  if (blocked) return blocked
  try {
    // El modelo lo fija el servidor: se ignora el que mande el cliente
    const { messages, tools, reasoning_effort, stream } = (await request.json()) as {
      messages?: unknown
      tools?: unknown
      reasoning_effort?: string
      stream?: boolean
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
      ...(stream ? { stream: true } : {}),
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

    if (stream && upstream.body) {
      return new Response(streamResponsesToSse(upstream.body), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      })
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
