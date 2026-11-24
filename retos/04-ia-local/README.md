---
title: IA en local en la web
bloque: 4
minutos: 10
resumen: Resumimos las reseñas de cada producto con un modelo que se ejecuta en el navegador, sin que los datos salgan del dispositivo.
editor:
  entrada: index.html
  archivos: [ia-local.js, main.js, interfaz.js, tienda.js, productos.js, index.html, estilos.css]
---

## Objetivo

El botón **Resumir reseñas en local** de cada producto va a funcionar con un modelo que se ejecuta **en tu navegador**:

- **Privado**: las reseñas no salen del dispositivo.
- **Sin coste por petición**: no hay servidor ni API key.
- **Sin conexión**: una vez descargado el modelo, funciona en un avión.

Dos caminos, y tu código elige:

| Camino | Qué es | Pega |
| --- | --- | --- |
| **APIs integradas de Chrome** | Gemini Nano dentro del navegador: `Summarizer`, `LanguageModel`, `Translator`… | Solo Chrome de escritorio y con requisitos de hardware |
| **WebGPU + Transformers.js** | Tú eliges y descargas el modelo; se ejecuta en la GPU | El usuario descarga cientos de MB |

Todo el trabajo está en los huecos amarillos de `ia-local.js`. Mientras no los completes, el botón te dice qué falta.

<!-- editor -->

## Pasos

### 1. ¿Está disponible?

La API integrada vive en el objeto global `Summarizer` (en `self`). Comprueba si existe antes de preguntarle con `Summarizer.availability()` si puede resumir en español: si no está, devuelve `'unavailable'`.

```js
if (!(___)) return 'unavailable';
```

> Gemini Nano necesita Chrome de escritorio, 22 GB libres en disco y una GPU con más de 4 GB de VRAM (o 16 GB de RAM y 4 núcleos). Si tu navegador no lo tiene, no pasa nada: el plan B (pasos 4 y 5) funciona en cualquier navegador moderno.

### 2. Crea y configura el resumidor

Crea el resumidor con `Summarizer.create({ … })`, elige el tipo de resumen (`'tldr'`, `'key-points'`, `'teaser'` o `'headline'`) y el idioma de salida en español (`'es'`):

```js
const summarizer = await ___({
  type: ___, // 'key-points' | 'tldr' | 'teaser' | 'headline'
  // …
  outputLanguage: ___,
});
```

La primera vez, Chrome descarga el modelo (una sola vez para todas las webs). Por eso `create()` necesita que el usuario haya hecho clic.

### 3. Resume con Gemini Nano, en streaming

Con el resumidor ya creado, pídele el resumen a trozos, según se escribe:

```js
const stream = ___;
```

### 4. Plan B: carga el modelo con Transformers.js

El mismo patrón (cargar el modelo → generar en streaming) con una librería en vez de una API del navegador. `pipeline` recibe la tarea, el modelo y las opciones:

```js
generador ??= await ___;
```

`device` es `'webgpu'` si hay GPU y `'wasm'` si no; `dtype` es la cuantización (unos 470 MB en vez de 3 GB, a cambio de algo de calidad). El `??=` hace que el modelo se cargue una sola vez.

### 5. Plan B: el resumen, según se escribe

El modelo escribe a trozos: cada vez que llega uno, súmalo a lo que llevas y enséñalo.

```js
texto += ___;
alEscribir?.(___);
```

Abre un producto y pulsa **Resumir reseñas en local**. Si tu navegador no tiene Gemini Nano, la primera vez descarga Qwen3.5 0.8B (unos 470 MB): toda la sala comparte la wifi, así que pulsa una sola vez y espera. Después, desconecta el wifi y vuelve a probar.

> Las comprobaciones de los pasos no descargan nada: usan un `Summarizer` y un Transformers.js falsos que «escriben» un resumen inventado.

Qwen3.5 0.8B (800 millones de parámetros, multilingüe) es de lo mejor que cabe en una descarga razonable. Compara su resumen con el de Gemini Nano: a veces mezcla o se inventa algún detalle. **Esa es la limitación**: en local, el tamaño del modelo lo paga el usuario.

## ¿Local o nube?

| | Local | Nube |
| --- | --- | --- |
| Privacidad | Los datos no salen del dispositivo | Viajan a un tercero |
| Coste | Cero por petición | Por token |
| Sin conexión | Sí | No |
| Calidad | Modelos pequeños: tareas acotadas | Los mejores modelos |
| Primera vez | Descarga del modelo | Inmediato |
| Compatibilidad | Depende del navegador y del hardware | Cualquier dispositivo |

**Regla práctica**: local para tareas pequeñas y frecuentes sobre datos del usuario (resumir, traducir, corregir, clasificar). Nube cuando hace falta razonar, mucho contexto o que funcione igual en todos los dispositivos. Y siempre con plan B.
