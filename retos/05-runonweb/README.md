---
title: Más IA en local con runonweb
bloque: 5
extra: true
minutos: 10
resumen: Traducimos reseñas, buscamos por significado y dictamos la búsqueda con modelos que se ejecutan en el navegador. Un import por tarea.
editor:
  entrada: index.html
  archivos: [runonweb.js, main.js, interfaz.js, tienda.js, productos.js, index.html, estilos.css]
---

## Objetivo

En el reto 4 montaste la IA en local a mano: comprobar la API de Chrome, cargar Transformers.js, elegir el modelo, la cuantización y el plan B. [runonweb](https://runonweb.ai) empaqueta ese trabajo: **un import por tarea**, con un modelo ya elegido, WebGPU o WASM según el dispositivo y la caché del navegador.

Tres funciones nuevas para la tienda, todas en tu dispositivo. Todo el trabajo está en `runonweb.js`:

| Botón | Módulo | Modelo | Descarga |
| --- | --- | --- | --- |
| **Traducir al inglés** (en la ficha) | `runonweb/translate` | Firefox Translations (Bergamot, WASM) | ~35 MB |
| **Buscar por significado** | `runonweb/embed` | paraphrase-multilingual-MiniLM-L12-v2 | ~120 MB |
| **Dictar** | `runonweb/stt` | Whisper base | ~80 MB |

> Cada modelo se descarga la primera vez y se queda en la caché del navegador. Como toda la sala comparte la wifi, haz los pasos en orden y no pulses el botón varias veces mientras descarga. Las comprobaciones de los pasos no descargan nada: usan versiones falsas de los módulos.

<!-- editor -->

## Pasos

### 1. Traduce las reseñas

El traductor ya se crea con `new Translator({ from: 'es', to: 'en', … })`. Falta traducir el texto de cada reseña:

```js
const { text } = await ___;
```

Abre un producto y pulsa **Traducir al inglés**. `Translator` usa Bergamot, el motor de las traducciones de Firefox, compilado a WASM: no necesita WebGPU y funciona en cualquier navegador. `progreso()` ya está hecho: junta los avisos de descarga de cada archivo en un porcentaje.

### 2. Busca por significado

Un modelo de *embeddings* convierte un texto en un vector (aquí, 384 números). Los textos que significan lo mismo quedan cerca, aunque no compartan ni una palabra. Los vectores de los productos ya se calculan; falta el de la petición y compararlos con `cosineSimilarity`:

```js
const { embeddings: [consulta] } = await ___;
const parecido = (indice) => ___;
```

Prueba «algo para no oír a nadie en el tren» o «quiero el café caliente toda la mañana». El buscador de arriba busca palabras y no encuentra nada; la búsqueda de Jev (reto 3) razona en la nube; los embeddings solo miden parecido, pero en local y en milisegundos.

### 3. Dicta la búsqueda

La interfaz ya graba el micrófono con `MediaRecorder` y te pasa el audio (un `Blob`). El reconocedor, Whisper, también está creado; solo falta pasar el audio a texto:

```js
const { text } = await ___;
```

Pulsa **Dictar**, habla y vuelve a pulsar. Whisper transcribe en tu navegador y se lanza la búsqueda por significado con lo que has dicho.

## ¿A mano o con una librería?

| | A mano (reto 4) | runonweb |
| --- | --- | --- |
| Modelo y cuantización | Los eliges tú | Valores por defecto probados; los cambias con `model` y `device` |
| WebGPU o WASM | Lo detectas tú | `device: 'auto'`: WebGPU si hay, WASM si no |
| Progreso de la descarga | Callback de Transformers.js | `onProgress` en todos los módulos |
| Tareas | Las que montes | Voz, visión y texto con la misma API: `stt`, `tts`, `translate`, `embed`, `classify`, `ocr`, `remove-bg`, `caption`… |

Mira el resto de módulos en [runonweb.ai/docs](https://runonweb.ai/docs). Uno curioso: `runonweb/classify` usa Kev, un modelo con las mismas preguntas que Jev (`choice`, `noul`), pero en el navegador.
