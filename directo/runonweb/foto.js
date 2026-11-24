// En directo: IA en local con runonweb. Abre /directo/runonweb en la web del taller y descomenta
// los pasos en orden (selecciona las líneas de código de cada paso y pulsa Cmd + /).
// La página se recarga sola al guardar y funciona después de cada paso.

// runonweb (https://runonweb.ai) empaqueta modelos que se ejecutan en el navegador: un import por tarea.
// Cada modelo se descarga la primera vez y se queda en la caché del navegador. Nada sale del dispositivo.

// La página pinta la descarga de cada modelo con estos avisos (no hace falta tocarlo)
const avisar = (paso) => (progreso) => dispatchEvent(new CustomEvent('runonweb', { detail: { paso, ...progreso } }));

// ─── PASO 1 · Quitar el fondo ──────────────────────────────────────────────────────
// BEN2 (~220 MB) separa el objeto del fondo y devuelve un PNG transparente.
import { RemoveBackground } from 'runonweb/remove-bg';

const recortador = new RemoveBackground({ onProgress: avisar('fondo') });

export async function quitarFondo(foto) {
  return recortador.remove(foto); // Blob PNG con transparencia
}

// ─── PASO 2 · Describir la foto en español ─────────────────────────────────────────
// LFM2.5-VL 450M (~320 MB) mira la imagen y escribe; onPartial recibe el texto según se genera.
import { ImageCaptioner } from 'runonweb/caption';

const descriptor = new ImageCaptioner({ language: 'es', detail: 'detailed', onProgress: avisar('describir') });

export async function describir(foto, alEscribir) {
  const { text } = await descriptor.caption(foto, { onPartial: alEscribir });
  return text;
}

// ─── PASO 3 · Leer la descripción en voz alta ──────────────────────────────────────
// Supertonic 2 (~260 MB): texto a voz en español, inglés, francés, portugués y coreano.
import { TextToSpeech } from 'runonweb/tts';

const voz = new TextToSpeech({ size: 'multi', voice: 'st_f1', language: 'es', onProgress: avisar('leer') });

export async function leer(texto) {
  return voz.speakToBlob(texto); // Blob WAV
}
