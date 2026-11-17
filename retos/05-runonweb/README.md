---
title: Más IA en local con runonweb
bloque: 5
extra: true
minutos: 15
resumen: Traducimos reseñas, buscamos por significado y dictamos la búsqueda con modelos que se ejecutan en el navegador. Un import por tarea.
---

## Objetivo

En el reto 4 montaste la IA en local a mano: comprobar la API de Chrome, cargar Transformers.js, elegir el modelo, la cuantización y el plan B. [runonweb](https://runonweb.ai) empaqueta ese trabajo: **un import por tarea**, con un modelo ya elegido, WebGPU o WASM según el dispositivo y la caché del navegador.

Tres funciones nuevas para la tienda, todas en el dispositivo del usuario:

| Botón | Módulo | Modelo | Descarga |
| --- | --- | --- | --- |
| **Traducir al inglés** (en la ficha) | `runonweb/translate` | Firefox Translations (Bergamot, WASM) | ~35 MB |
| **Buscar por significado** | `runonweb/embed` | paraphrase-multilingual-MiniLM-L12-v2 | ~120 MB |
| **Dictar** | `runonweb/stt` | Whisper base | ~80 MB |
| **Escuchar** (extra) | `runonweb/tts` | Supertonic 2 | ~260 MB |

## Arranca

```bash
cd retos/05-runonweb/inicio
npm install
npm run dev        # http://localhost:3005
```

Arriba tienes dos pestañas: **Tu código** (la carpeta `inicio`, la que vas a tocar) y **Ver solución** (`http://localhost:3005/solucion/`), que ejecuta la carpeta `solucion` en el mismo servidor.

> Cada modelo se descarga la primera vez y se queda en la caché del navegador. Como toda la sala comparte la wifi, haz los pasos en orden y no pulses el botón varias veces mientras descarga.

## Pasos

Todo el trabajo está en `src/runonweb.js`. Arriba del archivo están los imports de cada paso: descoméntalos según avances.

### 1. Traduce las reseñas

```js
import { Translator } from 'runonweb/translate';

let traductor; // fuera de la función: se crea una vez y se reutiliza

export async function traducirReseñas(producto, { alProgresar } = {}) {
  traductor ??= new Translator({ from: 'es', to: 'en', onProgress: progreso(alProgresar) });

  const traducciones = [];
  for (const reseña of producto.reseñas) {
    const { text } = await traductor.translate(reseña.texto);
    traducciones.push(text);
  }
  return traducciones;
}
```

Abre un producto y pulsa **Traducir al inglés**. `Translator` usa Bergamot, el motor de las traducciones de Firefox, compilado a WASM: no necesita WebGPU y funciona en cualquier navegador. `progreso()` ya está hecho: junta los avisos de descarga de cada archivo en un porcentaje.

### 2. Busca por significado

Un modelo de *embeddings* convierte un texto en un vector (aquí, 384 números). Los textos que significan lo mismo quedan cerca, aunque no compartan ni una palabra. Para buscar, se compara el vector de la petición con el de cada producto:

```js
import { TextEmbedder, cosineSimilarity } from 'runonweb/embed';

let embedder;
let vectores; // un vector por producto, calculado una sola vez

export async function buscarPorSignificado(peticion, productos, { alProgresar } = {}) {
  embedder ??= new TextEmbedder({
    model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', // el de por defecto solo entiende inglés
    device: 'wasm', // en WASM va en 8 bits: pesa la mitad que en WebGPU
    onProgress: progreso(alProgresar),
  });

  vectores ??= (await embedder.embed(productos.map((p) => `${p.nombre}. ${p.descripcion} (${p.categoria})`))).embeddings;
  const { embeddings: [consulta] } = await embedder.embed(peticion);

  return productos
    .map((producto, i) => ({ producto, encaje: Math.max(0, cosineSimilarity(consulta, vectores[i])) }))
    .sort((a, b) => b.encaje - a.encaje)
    .slice(0, 4);
}
```

Prueba «algo para no oír a nadie en el tren» o «quiero el café caliente toda la mañana». El buscador de arriba busca palabras y no encuentra nada; la búsqueda de Jev (reto 3) razona en la nube; los embeddings solo miden parecido, pero en local y en milisegundos.

### 3. Dicta la búsqueda

La interfaz ya graba el micrófono con `MediaRecorder` y te pasa el audio (un `Blob`). Solo falta pasarlo a texto:

```js
import { SpeechToText } from 'runonweb/stt';

let oido;

export async function dictar(audio, { alProgresar, alEscribir } = {}) {
  oido ??= new SpeechToText({
    model: 'onnx-community/whisper-base', // multilingüe; el de por defecto solo sabe inglés
    device: 'wasm',
    language: 'es',
    onProgress: progreso(alProgresar),
  });

  const { text } = await oido.transcribe(audio, { onPartial: alEscribir });
  return text.trim();
}
```

Pulsa **Dictar**, habla y vuelve a pulsar. Whisper transcribe en tu navegador y se lanza la búsqueda por significado con lo que has dicho.

### 4. Extra: escucha el resumen

```js
import { TextToSpeech } from 'runonweb/tts';

let voz;

export async function leerEnVozAlta(texto, { alProgresar } = {}) {
  voz ??= new TextToSpeech({ size: 'multi', voice: 'st_f1', language: 'es', onProgress: progreso(alProgresar) });
  return voz.speakToBlob(texto); // Blob WAV
}
```

**Escuchar** lee el resumen del reto 4 si ya lo has generado; si no, la descripción del producto.

## ¿A mano o con una librería?

| | A mano (reto 4) | runonweb |
| --- | --- | --- |
| Modelo y cuantización | Los eliges tú | Valores por defecto probados; los cambias con `model` y `device` |
| WebGPU o WASM | Lo detectas tú | `device: 'auto'`: WebGPU si hay, WASM si no |
| Progreso de la descarga | Callback de Transformers.js | `onProgress` en todos los módulos |
| Tareas | Las que montes | Voz, visión y texto con la misma API: `stt`, `tts`, `translate`, `embed`, `classify`, `ocr`, `remove-bg`, `caption`… |

Mira el resto de módulos en [runonweb.ai/docs](https://runonweb.ai/docs). Uno curioso: `runonweb/classify` usa Kev, un modelo con las mismas preguntas que Jev (`choice`, `noul`), pero en el navegador.

> **Si usas runonweb con Vite 8**, añade `optimizeDeps: { rolldownOptions: { moduleTypes: { '.ts': 'ts' } } }` al `vite.config.js` (ya está en este reto). runonweb se publica en TypeScript y, sin eso, Vite intenta leer sus `.ts` como JSX y el servidor se cae.
