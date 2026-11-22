// Reto 5 · Más IA en local con runonweb (https://runonweb.ai): un import por tarea.
// Cada modelo se descarga la primera vez y se queda en la caché del navegador. Nada sale del dispositivo.
import { cosineSimilarity, TextEmbedder } from 'runonweb/embed';
import { SpeechToText } from 'runonweb/stt';
import { Translator } from 'runonweb/translate';

/**
 * runonweb avisa de la descarga archivo a archivo: { status, file, loaded, total, progress }.
 * Esto los junta en un solo porcentaje para la interfaz (no hace falta tocarlo).
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

// ── 1 · Traducir las reseñas ──────────────────────────────────────────────

let traductor; // se crea la primera vez y se reutiliza

/**
 * Traduce al inglés las reseñas de un producto. Devuelve un texto por reseña, en el mismo orden.
 * Usa los modelos de Firefox Translations (~35 MB por idioma) en WASM: funciona en cualquier navegador.
 */
export async function traducirReseñas(producto, { alProgresar } = {}) {
  traductor ??= new Translator({ from: 'es', to: 'en', onProgress: progreso(alProgresar) });

  const traducciones = [];
  for (const reseña of producto.reseñas) {
    // TODO 1: traduce el texto de la reseña con el traductor. translate() devuelve { text }
    //[hueco TODO 1]
    const { text } = await ___;
    //[solución]
    const { text } = await traductor.translate(reseña.texto);
    //[/hueco]
    traducciones.push(text);
  }
  return traducciones;
}

// ── 2 · Buscar por significado ────────────────────────────────────────────

// Multilingüe: el modelo por defecto de runonweb (all-MiniLM-L6-v2) solo entiende inglés.
// En WASM se usa la versión de 8 bits (~120 MB); en WebGPU, la de 16 bits pesa el doble.
const MODELO_EMBEDDINGS = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let embedder;
let vectores; // un vector por producto: se calculan una sola vez

/**
 * Ordena los productos por parecido con la petición, aunque no compartan ni una palabra.
 * Devuelve los 4 mejores: [{ producto, encaje }], con encaje entre 0 y 1.
 */
export async function buscarPorSignificado(peticion, productos, { alProgresar } = {}) {
  embedder ??= new TextEmbedder({ model: MODELO_EMBEDDINGS, device: 'wasm', onProgress: progreso(alProgresar) });

  // Cada producto se convierte en un vector (384 números) con su nombre, su descripción y su categoría
  vectores ??= (await embedder.embed(productos.map((p) => `${p.nombre}. ${p.descripcion} (${p.categoria})`))).embeddings;

  // TODO 2: convierte también la petición en un vector (embed). Los vectores cercanos significan cosas
  // parecidas: cosineSimilarity(a, b) dice cuánto se parecen dos vectores, de -1 a 1
  //[hueco TODO 2]
  const { embeddings: [consulta] } = await ___;
  const parecido = (indice) => ___;
  //[solución]
  const { embeddings: [consulta] } = await embedder.embed(peticion);
  const parecido = (indice) => cosineSimilarity(consulta, vectores[indice]);
  //[/hueco]

  return productos
    .map((producto, indice) => ({ producto, encaje: Math.max(0, parecido(indice)) }))
    .sort((a, b) => b.encaje - a.encaje)
    .slice(0, 4);
}

// ── 3 · Dictar la búsqueda ────────────────────────────────────────────────

let oido;

/**
 * Pasa a texto lo grabado con el micrófono (un Blob de MediaRecorder).
 *   alEscribir(parcial) → el texto según Whisper lo va escribiendo
 */
export async function dictar(audio, { alProgresar, alEscribir } = {}) {
  oido ??= new SpeechToText({
    model: 'onnx-community/whisper-base', // multilingüe; el de por defecto solo sabe inglés
    device: 'wasm',
    language: 'es',
    onProgress: progreso(alProgresar),
  });

  // TODO 3: transcribe el audio. Con onPartial, Whisper te va dando el texto según lo escribe: pásale alEscribir
  //[hueco TODO 3]
  const { text } = await ___;
  //[solución]
  const { text } = await oido.transcribe(audio, { onPartial: alEscribir });
  //[/hueco]
  return text.trim();
}
