# Webs listas con la IA

Taller de la Upskilling Week Barcelona (Mobile World Capital): **MCP UI, WebMCP, Jev e IA local en el navegador**.

Web del taller: https://upskilling-mwc-taller.midudev.workers.dev

Este repositorio contiene:

| Carpeta | Qué es |
| --- | --- |
| `src/` | La web del taller (Astro): inicio, agenda, enunciados de los retos y la presentación |
| `retos/` | Los cuatro retos y uno extra (runonweb). Se hacen en el navegador: `editor/` tiene los archivos del editor de la web y `README.md`, el enunciado |
| `directo/` | El código de las partes en directo, en pasos comentados que se descomentan. `directo/liga`: un MCP con los resultados de LaLiga y, después, con interfaz; `directo/jev`: la primera decisión con Jev; `directo/runonweb`: una foto pasa por tres modelos en el navegador |

## Instalación

Es un monorepo: la raíz y cada parte del directo (`directo/liga/*`) son workspaces. Un solo `install` en la raíz instala las dependencias de todo el proyecto, con el gestor que prefieras:

```bash
npm install    # o
pnpm install   # o
bun install
```

Hay un lockfile para cada uno (`package-lock.json`, `pnpm-lock.yaml` y `bun.lock`). Si cambias dependencias, actualiza los tres.

## La web

```bash
pnpm install
cp .dev.vars.example .dev.vars   # y rellena las claves y el token del taller
pnpm dev
```

| Ruta | Contenido |
| --- | --- |
| `/` | Presentación del taller, agenda (`src/data/agenda.ts`) y requisitos |
| `/retos` | Los retos, con el editor en la página. Se generan a partir de `retos/*/README.md` y `retos/*/editor/` |
| `/slides` | La presentación |
| `/directo` | Las demos en directo. Las de IA local (`/directo/traductor`, `/directo/chat`, `/directo/runonweb`) descargan sus modelos la primera vez: ábrelas antes de la charla para que queden en la caché |

### Presentación

`→` `espacio` `Enter` siguiente · `←` anterior · `Inicio` / `Fin` · `F` pantalla completa. También con clic (mitad derecha o izquierda) y con mando de presentaciones. Cada slide tiene su URL: `/slides#12`.

Las slides están en `src/pages/slides.astro`; la primera y la última son las imágenes de `public/slides/`.

## Despliegue en Cloudflare

```bash
pnpm wrangler secret put WORKSHOP_TOKEN
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put TYPESAFE_API_KEY

pnpm build && pnpm wrangler deploy
```

El token no está en git ni se muestra en las slides. Se lee de `WORKSHOP_TOKEN` en `.dev.vars` al compilar para que funcionen el editor de los retos y las demos en directo. Tiene que coincidir con el secreto del Worker. Al terminar el taller, cambia el secreto para que deje de funcionar.

## Los retos

Una misma tienda online, cuatro piezas. Los asistentes los hacen **en la web del taller, sin instalar nada**: cada `/retos/<reto>` tiene un editor con todos los archivos del proyecto, el resultado al lado y unos pasos que se comprueban solos al ejecutar. Unos 10 minutos cada uno.

| Reto | Se edita | El resultado |
| --- | --- | --- |
| 1 · MCP UI | `server.js` y `vista/app.js` | Un probador: cliente MCP + host de MCP Apps, con tu servidor ejecutándose en el navegador |
| 2 · WebMCP | `webmcp.js` | La tienda y el panel **Agente**, que lista y ejecuta tus herramientas de `document.modelContext` |
| 3 · Jev | `jev.js` | La tienda, con búsqueda inteligente y moderación de reseñas |
| 4 · IA local | `ia-local.js` | La tienda, con el resumen de reseñas (Gemini Nano o Transformers.js) |
| 5 · runonweb (extra) | `runonweb.js` | La tienda, con traducción, búsqueda por significado y dictado |

### Cómo funciona el editor

- **Los archivos** de cada reto están en `retos/<reto>/editor/`, con `comprobaciones.js` (los pasos, sus pistas y cómo se comprueban). Lo que no esté ahí se busca en `retos/tienda/`, la tienda compartida por los retos 2–5 (`interfaz.js`, `tienda.js`, `productos.js`, `index.html`, `estilos.css`, `config.js`).
- **Los huecos**: un archivo es editable si tiene huecos, y en el editor solo se puede escribir dentro de ellos; el resto está bloqueado. Cada hueco son unas líneas con `___` donde falta algo y su solución, justo debajo del comentario `// TODO n` que lo explica:

  ```js
  // TODO 1: la API de WebMCP vive en el objeto document
  //[hueco TODO 1]
  const modelContext = ___;
  //[solución]
  const modelContext = document.modelContext;
  //[/hueco]
  ```

  Al ejecutar, cada `___` vale `undefined` y avisa en la consola de dónde está. **Ver solución** enseña el archivo con los huecos resueltos.
- **Las pistas** de cada paso (`pistas` en `comprobaciones.js`) salen de una en una, de la más general a la casi solución. Después de la última, **Rellenar con la solución** escribe la respuesta en el hueco.
- **La lista de archivos**, el HTML de entrada y lo que necesita cada reto van en el frontmatter del `README.md` (`editor:`). El enunciado se parte en `<!-- editor -->`: lo de antes va encima del editor y el resto, debajo.
- **Se ejecuta en un iframe** sin servidor ni bundler (`src/lib/retos/ejecutar.ts`): cada `.js` es un módulo `blob:` y un import map resuelve los imports relativos y los paquetes de npm. El iframe es del mismo origen que la web, así que las comprobaciones leen su `window`.
- **Los paquetes de npm** que importa el código de los retos (SDK de MCP, `zod`, Transformers.js, runonweb) se empaquetan en `public/retos/vendor/` con `scripts/vendor-retos.mjs`. Lo lanza solo `astro dev` / `astro build` cuando cambian los lockfiles (no está en git). La lista está en `src/lib/retos/paquetes.js`.
- **Las comprobaciones** se ejecutan en otro iframe, oculto, para no tocar lo que ve el asistente. No hacen peticiones reales ni descargan modelos: usan `fetch` falsos y módulos falsos (`falsos` en `comprobaciones.js`).
- **WebMCP** (reto 2): el editor pone su propia `document.modelContext` (`src/lib/retos/runtime/webmcp.js`) para que funcione en cualquier navegador, sin el flag de Chrome.
- Lo que cada asistente escribe en los huecos se guarda en su `localStorage`. **Reiniciar** lo borra y **Ver solución** → **Copiar a tus huecos** lo sustituye por la solución. Si cambias el texto fijo de un archivo (lo que no está en un hueco), lo guardado de ese archivo deja de valer.
- **El resultado va en claro** (la tienda, el probador y la vista del reto 1) para distinguirlo del código, que es oscuro.

Si cambias un reto, comprueba que al empezar todos los pasos fallan diciendo qué falta y que, con **Rellenar con la solución** en cada uno, todos salen en verde.
