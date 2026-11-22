// Límites de coste de las peticiones a OpenAI. El modelo va fijo en el código (no en una variable de
// entorno) y cada petición tiene un techo de gasto. Lo que se puede recortar sin romper la petición se
// recorta en silencio (razonamiento, tokens de salida, nivel de servicio); lo que cambiaría la
// respuesta (herramientas de pago, varias respuestas, archivos…) se rechaza con un 400.

/** Único modelo de OpenAI que se puede usar en el taller. */
export const OPENAI_MODEL = 'gpt-6-luna';

/** Esfuerzo de razonamiento máximo. Si se pide más, se baja a este. */
export const MAX_REASONING_EFFORT = 'medium';

/** Tokens de salida máximos por petición (los de razonamiento cuentan). */
export const MAX_OUTPUT_TOKENS = 8192;

/** Imágenes máximas por petición: por URL no las frena el límite de tamaño del cuerpo. */
export const MAX_IMAGES = 4;

/** Esfuerzos admitidos, hasta MAX_REASONING_EFFORT incluido. */
const ALLOWED_EFFORTS = new Set(['none', 'minimal', 'low', MAX_REASONING_EFFORT]);

/** Solo herramientas que ejecuta el cliente: las de OpenAI (búsqueda web, imágenes, MCP…) se cobran aparte. */
const ALLOWED_TOOLS = new Set(['function', 'custom']);

export type OpenAIApi = 'chat' | 'responses';

/** Campos que se rechazan si vienen con valor, con lo que activan. */
const FORBIDDEN_FIELDS: Record<OpenAIApi, Record<string, string>> = {
  chat: {
    web_search_options: 'La búsqueda web',
    audio: 'La salida de audio',
  },
  responses: {
    // Encadenar respuestas guardadas vuelve a cobrar todo el historial sin pasar por el límite de 256 KB
    previous_response_id: 'Encadenar respuestas con previous_response_id (envía el historial en input)',
    conversation: 'Las conversaciones guardadas (envía el historial en input)',
    background: 'El modo background',
  },
};

export interface LimitError {
  message: string;
  type: 'model_not_allowed' | 'not_allowed';
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampTokens = (value: unknown) =>
  typeof value === 'number' && value > 0 ? Math.min(value, MAX_OUTPUT_TOKENS) : MAX_OUTPUT_TOKENS;

/** Cuenta las imágenes y busca archivos adjuntos en los mensajes (sin recursión: el JSON lo manda el cliente). */
function checkAttachments(root: unknown): LimitError | null {
  let images = 0;
  const pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      for (const item of value) pending.push(item);
    } else if (isObject(value)) {
      if (value.type === 'input_file' || value.type === 'file') {
        return { message: 'Los archivos adjuntos no están disponibles en el taller.', type: 'not_allowed' };
      }
      if (value.type === 'input_image' || value.type === 'image_url') images++;
      for (const item of Object.values(value)) pending.push(item);
    }
  }
  return images > MAX_IMAGES
    ? { message: `Como máximo ${MAX_IMAGES} imágenes por petición.`, type: 'not_allowed' }
    : null;
}

/**
 * Aplica los límites a una petición a Chat Completions o a Responses. Modifica `payload` (recortes)
 * y devuelve el error si hay que rechazarla, o null si puede seguir.
 */
export function limitOpenAIRequest(api: OpenAIApi, payload: Record<string, unknown>): LimitError | null {
  payload.model ??= OPENAI_MODEL;
  if (payload.model !== OPENAI_MODEL) {
    return {
      message: `Modelo no disponible en el taller. El único modelo permitido es ${OPENAI_MODEL}.`,
      type: 'model_not_allowed',
    };
  }

  for (const [field, feature] of Object.entries(FORBIDDEN_FIELDS[api])) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== false) {
      return { message: `${feature} no está disponible en el taller.`, type: 'not_allowed' };
    }
  }

  if (api === 'chat' && payload.n !== undefined && payload.n !== null && payload.n !== 1) {
    return { message: 'Solo se admite una respuesta por petición (n = 1).', type: 'not_allowed' };
  }

  if (Array.isArray(payload.tools)) {
    for (const tool of payload.tools) {
      const type = isObject(tool) ? tool.type : undefined;
      if (typeof type !== 'string' || !ALLOWED_TOOLS.has(type)) {
        return {
          message: `La herramienta "${String(type)}" no está disponible en el taller: usa herramientas de tipo function.`,
          type: 'not_allowed',
        };
      }
    }
  }

  const attachments = checkAttachments(api === 'chat' ? payload.messages : payload.input);
  if (attachments) return attachments;

  // Recortes: si no se indica esfuerzo, se deja el del modelo
  if (api === 'chat') {
    if (payload.reasoning_effort != null && !ALLOWED_EFFORTS.has(payload.reasoning_effort as string)) {
      payload.reasoning_effort = MAX_REASONING_EFFORT;
    }
    payload.max_completion_tokens = clampTokens(payload.max_completion_tokens ?? payload.max_tokens);
    delete payload.max_tokens;
  } else {
    if (isObject(payload.reasoning) && payload.reasoning.effort != null && !ALLOWED_EFFORTS.has(payload.reasoning.effort as string)) {
      payload.reasoning.effort = MAX_REASONING_EFFORT;
    }
    payload.max_output_tokens = clampTokens(payload.max_output_tokens);
  }

  // `priority` cuesta más; `flex` es más barato y se respeta
  if (payload.service_tier !== 'flex') payload.service_tier = 'default';

  return null;
}
