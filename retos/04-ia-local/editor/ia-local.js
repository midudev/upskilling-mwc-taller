// Reto 4 · IA en local: el modelo se ejecuta en el navegador.
// Las reseñas no salen del dispositivo, no hay coste por petición y funciona sin conexión.

// Plan B para los navegadores sin IA integrada: un modelo pequeño (unos 470 MB) con Transformers.js.
// Qwen3.5 0.8B: multilingüe y de 2026. Gemma 4 E2B escribe mejor, pero pesa unos 3 GB.
const MODELO = 'onnx-community/Qwen3.5-0.8B-Text-ONNX';

const textoDeReseñas = (producto) =>
  producto.reseñas.map((reseña) => `${reseña.autor} (${reseña.nota}/5): ${reseña.texto}`).join('\n');

/**
 * Resume las reseñas de un producto sin salir del navegador. Devuelve { texto, motor }.
 *   alProgresar(porcentaje) → progreso de la descarga del modelo
 *   alEscribir(parcial)     → el texto generado hasta el momento (streaming)
 */
export async function resumirReseñas(producto, { alProgresar, alEscribir } = {}) {
  // 1. La API integrada de Chrome (Gemini Nano), si el navegador la tiene
  if ((await disponibilidad()) !== 'unavailable') {
    return resumirConChrome(producto, { alProgresar, alEscribir });
  }
  // 2. Plan B: Transformers.js, en cualquier navegador moderno
  return resumirConTransformers(producto, { alProgresar, alEscribir });
}

/** Estado de la API Summarizer: 'unavailable', 'downloadable', 'downloading' o 'available' */
export async function disponibilidad() {
  // Algunos navegadores tardan mucho en contestar: si no lo hacen en 3 segundos, vamos al plan B
  const espera = new Promise((resolve) => setTimeout(resolve, 3000, 'unavailable'));

  // TODO 1: la API vive en el objeto global Summarizer (en self). Si no está, este navegador no la tiene
  //[hueco TODO 1]
  if (!(___)) return 'unavailable';
  //[solución]
  if (!('Summarizer' in self)) return 'unavailable';
  //[/hueco]

  // Le pregunta a la API si puede resumir en español (availability). Gana lo que llegue antes
  return Promise.race([Summarizer.availability({ outputLanguage: 'es' }), espera]).catch(() => 'unavailable');
}

/** Gemini Nano, el modelo que trae Chrome. La primera vez lo descarga (una sola vez para todas las webs) */
export async function resumirConChrome(producto, { alProgresar, alEscribir } = {}) {
  // TODO 2: crea el resumidor con Summarizer.create(), elige el tipo de resumen y el idioma de salida ('es')
  //[hueco TODO 2]
  const summarizer = await ___({
    type: ___, // 'key-points' | 'tldr' | 'teaser' | 'headline'
  //[solución]
  const summarizer = await Summarizer.create({
    type: 'tldr', // 'key-points' | 'tldr' | 'teaser' | 'headline'
  //[/hueco]
    format: 'plain-text', // 'markdown' | 'plain-text'
    length: 'short', // 'short' | 'medium' | 'long'
    expectedInputLanguages: ['es'],
  //[hueco TODO 2]
    outputLanguage: ___,
  //[solución]
    outputLanguage: 'es',
  //[/hueco]
    sharedContext: 'Reseñas de clientes de una tienda online.',
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (evento) => alProgresar?.(Math.round(evento.loaded * 100)));
    },
  });

  // TODO 3: pide el resumen en streaming (summarizeStreaming) del texto de las reseñas: textoDeReseñas(producto)
  //[hueco TODO 3]
  const stream = ___;
  //[solución]
  const stream = summarizer.summarizeStreaming(textoDeReseñas(producto));
  //[/hueco]

  // Llega a trozos: cada uno se suma a lo que ya llevamos y se enseña
  let texto = '';
  for await (const trozo of stream) {
    texto += trozo;
    alEscribir?.(texto);
  }

  summarizer.destroy();
  return { texto, motor: 'Gemini Nano · API Summarizer de Chrome' };
}

/** El modelo se descarga y se carga una sola vez; después se reutiliza */
let generador;

/** Plan B: un modelo pequeño con Transformers.js, en la GPU (WebGPU) o en la CPU (WebAssembly) */
export async function resumirConTransformers(producto, { alProgresar, alEscribir } = {}) {
  const { pipeline, TextStreamer } = await import('@huggingface/transformers');

  // WebGPU si hay GPU; si no, WebAssembly (más lento). Si la GPU calcula en media precisión
  // (shader-f16), el modelo pesa menos: 470 MB en vez de 550 MB
  const gpu = await navigator.gpu?.requestAdapter().catch(() => null);
  const device = gpu ? 'webgpu' : 'wasm';
  const dtype = gpu?.features.has('shader-f16') ? 'q4f16' : 'q4';

  // Avisos de la descarga del modelo, para la barra de progreso
  const progress_callback = (progreso) => {
    if (progreso.status === 'progress_total') alProgresar?.(Math.round(progreso.progress));
  };

  // TODO 4: carga el modelo con pipeline(tarea, modelo, opciones). La tarea es generar texto: 'text-generation'
  //[hueco TODO 4]
  generador ??= await ___;
  //[solución]
  generador ??= await pipeline('text-generation', MODELO, { device, dtype, progress_callback });
  //[/hueco]

  let texto = '';
  const streamer = new TextStreamer(generador.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function(trozo) {
      // TODO 5: el modelo escribe a trozos: suma cada trozo a `texto` y enseña todo lo que llevas con alEscribir
      //[hueco TODO 5]
      texto += ___;
      alEscribir?.(___);
      //[solución]
      texto += trozo;
      alEscribir?.(texto);
      //[/hueco]
    },
  });

  const salida = await generador(
    [
      {
        role: 'system',
        content:
          'Resumes reseñas de clientes de una tienda online. Responde en español con una sola frase con esta forma: «Los clientes valoran …, aunque …». Primero lo que más gusta y, tras «aunque», la queja principal. Usa solo lo que dicen las reseñas.',
      },
      { role: 'user', content: `Producto: ${producto.nombre}\n\nReseñas:\n${textoDeReseñas(producto)}` },
    ],
    { max_new_tokens: 120, do_sample: false, repetition_penalty: 1.05, streamer },
  );

  return {
    texto: salida[0].generated_text.at(-1).content.trim(),
    motor: `Qwen3.5 0.8B · Transformers.js (${device})`,
  };
}
