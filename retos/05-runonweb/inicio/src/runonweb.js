// Reto 5 · Más IA en local con runonweb (https://runonweb.ai): un import por tarea.
// Cada modelo se descarga la primera vez y se queda en la caché del navegador. Nada sale del dispositivo.
//
// Los imports que vas a necesitar (descoméntalos según avances):
// import { Translator } from 'runonweb/translate';                // TODO 1
// import { TextEmbedder, cosineSimilarity } from 'runonweb/embed'; // TODO 2
// import { SpeechToText } from 'runonweb/stt';                     // TODO 3
// import { TextToSpeech } from 'runonweb/tts';                     // Extra

/**
 * runonweb avisa de la descarga archivo a archivo: { status, file, loaded, total, progress }.
 * Esto los junta en un solo porcentaje para la interfaz (no hace falta tocarlo).
 * Úsalo así: new Translator({ …, onProgress: progreso(alProgresar) })
 */
function progreso(alProgresar) {
  const archivos = new Map();
  return ({ status, file, loaded, total, progress }) => {
    if (status !== 'progress' || !file) return;
    archivos.set(file, total ? { cargado: loaded, total } : { cargado: progress ?? 0, total: 100 });
    let cargado = 0;
    let suma = 0;
    for (const archivo of archivos.values()) {
      cargado += archivo.cargado;
      suma += archivo.total;
    }
    alProgresar?.(Math.round((cargado / suma) * 100));
  };
}

// ── TODO 1 · Traducir las reseñas ─────────────────────────────────────────

/**
 * Traduce al inglés las reseñas de un producto. Devuelve un texto por reseña, en el mismo orden.
 * Usa los modelos de Firefox Translations (~35 MB por idioma) en WASM: funciona en cualquier navegador.
 */
export async function traducirReseñas(producto, { alProgresar } = {}) {
  // TODO 1: crea el traductor una sola vez (guárdalo en una variable fuera de la función) y traduce cada reseña.
  //   traductor ??= new Translator({ from: 'es', to: 'en', onProgress: progreso(alProgresar) })
  //   for (const reseña of producto.reseñas) {
  //     const { text } = await traductor.translate(reseña.texto)
  //     …
  //   }
  // Devuelve un array con un texto por reseña.
  throw new Error('Pendiente: traducir las reseñas con runonweb/translate (src/runonweb.js, TODO 1).');
}

// ── TODO 2 · Buscar por significado ───────────────────────────────────────

/**
 * Ordena los productos por parecido con la petición, aunque no compartan ni una palabra.
 * Devuelve los 4 mejores: [{ producto, encaje }], con encaje entre 0 y 1.
 */
export async function buscarPorSignificado(peticion, productos, { alProgresar } = {}) {
  // TODO 2: convierte textos en vectores (embeddings) y compáralos.
  //   - El modelo por defecto solo entiende inglés: usa uno multilingüe, y en WASM pesa la mitad (~120 MB)
  //     embedder ??= new TextEmbedder({ model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', device: 'wasm', onProgress: … })
  //   - Un vector por producto, calculado una sola vez (guárdalos fuera de la función):
  //     vectores ??= (await embedder.embed(productos.map((p) => `${p.nombre}. ${p.descripcion} (${p.categoria})`))).embeddings
  //   - El vector de la petición: const { embeddings: [consulta] } = await embedder.embed(peticion)
  //   - encaje = cosineSimilarity(consulta, vectores[i]); ordena de mayor a menor y quédate con 4
  throw new Error('Pendiente: buscar por significado con runonweb/embed (src/runonweb.js, TODO 2).');
}

// ── TODO 3 · Dictar la búsqueda ───────────────────────────────────────────

/**
 * Pasa a texto lo grabado con el micrófono (un Blob de MediaRecorder).
 *   alEscribir(parcial) → el texto según Whisper lo va escribiendo
 */
export async function dictar(audio, { alProgresar, alEscribir } = {}) {
  // TODO 3: Whisper en el navegador.
  //   oido ??= new SpeechToText({
  //     model: 'onnx-community/whisper-base', // multilingüe; el de por defecto solo sabe inglés
  //     device: 'wasm',                       // en 8 bits pesa ~80 MB
  //     language: 'es',
  //     onProgress: …,
  //   })
  //   const { text } = await oido.transcribe(audio, { onPartial: alEscribir })
  // Devuelve el texto sin espacios al principio ni al final.
  throw new Error('Pendiente: dictar con runonweb/stt (src/runonweb.js, TODO 3).');
}

// ── Extra · Escuchar ──────────────────────────────────────────────────────

/** Lee un texto en voz alta en español. Devuelve un Blob WAV. */
export async function leerEnVozAlta(texto, { alProgresar } = {}) {
  // Extra: voz ??= new TextToSpeech({ size: 'multi', voice: 'st_f1', language: 'es', onProgress: … })
  //        return voz.speakToBlob(texto)
  throw new Error('Pendiente (extra): leer en voz alta con runonweb/tts (src/runonweb.js).');
}
