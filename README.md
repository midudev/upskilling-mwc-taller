# Webs listas con la IA

Taller de la Upskilling Week Barcelona (Mobile World Capital): **MCP UI, WebMCP, Jev e IA local en el navegador**.

Web del taller: https://upskilling-mwc-taller.midudev.workers.dev

Este repositorio contiene:

| Carpeta | Qué es |
| --- | --- |
| `src/` | La web del taller (Astro): inicio, agenda, enunciados de los retos, documentación de las APIs y la presentación |
| `src/pages/api/` | Las APIs del taller: un proxy de **Jev** y otro de **OpenAI**, protegidos con un token compartido |
| `retos/` | Los cuatro retos y uno extra (runonweb), cada uno con `inicio/`, `solucion/` y su enunciado (`README.md`) |
| `directo/` | El código de las partes en directo, en pasos comentados que se descomentan. `directo/liga`: un MCP con los resultados de LaLiga y, después, con interfaz; `directo/jev`: la primera decisión con Jev; `directo/runonweb`: una foto pasa por tres modelos en el navegador |

## Instalación

Es un monorepo: cada reto (`retos/*/inicio`, `retos/*/solucion`) y cada parte del directo (`directo/liga/*`) es un workspace. Un solo `install` en la raíz instala las dependencias de todo el proyecto, con el gestor que prefieras:

```bash
npm install    # o
pnpm install   # o
bun install
```

Hay un lockfile para cada uno (`package-lock.json`, `pnpm-lock.yaml` y `bun.lock`). Si cambias dependencias, actualiza los tres.

También puedes instalar desde la carpeta de un reto: `npm install` instala solo ese reto, y `pnpm install` o `bun install`, todo el monorepo.

## La web

```bash
pnpm install
cp .dev.vars.example .dev.vars   # y rellena las claves y el token del taller
pnpm dev
```

| Ruta | Contenido |
| --- | --- |
| `/` | Presentación del taller y requisitos |
| `/agenda` | Agenda con los tiempos de cada bloque (se edita en `src/data/agenda.ts`) |
| `/retos` | Enunciados. Se generan a partir de `retos/*/README.md` |
| `/apis` | Cómo usar las APIs de Jev y OpenAI |
| `/slides` | La presentación |
| `/directo` | Las demos en directo. Las de IA local (`/directo/traductor`, `/directo/chat`, `/directo/runonweb`) descargan sus modelos la primera vez: ábrelas antes de la charla para que queden en la caché |

### Presentación

`→` `espacio` `Enter` siguiente · `←` anterior · `Inicio` / `Fin` · `F` pantalla completa. También con clic (mitad derecha o izquierda) y con mando de presentaciones. Cada slide tiene su URL: `/slides#12`.

Las slides están en `src/pages/slides.astro`; la primera y la última son las imágenes de `public/slides/`.

## Las APIs

Los asistentes usan un único token (`WORKSHOP_TOKEN`). Las claves reales se quedan en el servidor.

| Endpoint | Destino |
| --- | --- |
| `POST /api/jev` (o `/api/jev/v1/systemone`) | `api.typesafe.ai/v1/systemone` |
| `GET /api/jev/v1/models` | `api.typesafe.ai/v1/models` |
| `POST /api/openai/v1/chat/completions` | OpenAI |
| `POST /api/openai/v1/responses` | OpenAI |
| `GET /api/openai/v1/models` | Lista de modelos permitidos |

- CORS abierto, para llamarlas desde el navegador.
- Límite de 300 peticiones cada 10 s por IP, y 256 KB por petición (`wrangler.jsonc` y `src/lib/proxy.ts`). Como toda la sala comparte la Wi-Fi (y por tanto la IP), el límite está pensado para la sala entera. Las respuestas 429 llevan `Retry-After` (el SDK de OpenAI reintenta solo).
- Los modelos de OpenAI permitidos se configuran en `OPENAI_MODELS` (`wrangler.jsonc`).
- Son compatibles con los SDK oficiales cambiando la `baseURL` (ver `/apis`).

## Despliegue en Cloudflare

```bash
pnpm wrangler secret put WORKSHOP_TOKEN
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put TYPESAFE_API_KEY

pnpm build && pnpm wrangler deploy
```

El token no está en git. Se lee de `WORKSHOP_TOKEN` en `.dev.vars` al compilar y se muestra en `/apis` y en las slides; los asistentes lo pegan una sola vez en `retos/config.js`, que comparten todos los retos. Tiene que coincidir con el secreto del Worker. Como `pnpm deploy` compila en local, la web desplegada sí lo muestra. Al terminar el taller, cambia el secreto para que deje de funcionar.

## Los retos

Una misma tienda online, cuatro piezas:

| Reto | Carpeta | Arrancar |
| --- | --- | --- |
| 1 · MCP UI | `retos/01-mcp-ui` | `npm install && npm run dev` → `http://localhost:3001/mcp` |
| 2 · WebMCP | `retos/02-webmcp` | `npm install && npm run dev` → `http://localhost:3002` |
| 3 · Jev | `retos/03-jev` | igual → `http://localhost:3003`; pega el token en `retos/config.js` |
| 4 · IA local | `retos/04-ia-local` | igual → `http://localhost:3004`. `solucion/` es la aplicación completa |
| 5 · runonweb (extra) | `retos/05-runonweb` | igual → `http://localhost:3005` |

Los retos 2, 3 y 4 comparten la misma tienda: el `inicio` de cada uno es la `solucion` del anterior. Solo cambian `src/webmcp.js`, `src/jev.js` y `src/ia-local.js`. El reto 5 parte de la `solucion` del 4 y le añade `src/runonweb.js` y sus botones (traducir, buscar por significado, dictar y escuchar); si cambias la tienda de los retos 2–4, cópialo también a `retos/05-runonweb`.

Cada reto se arranca desde `inicio/` y su demo tiene dos pestañas, **Tu código** y **Ver solución**, para ver la carpeta `solucion/` funcionando sin arrancar otro servidor:

- Reto 1: el probador (`http://localhost:3001`) habla con `/mcp` o con `/solucion/mcp`, que es el `crearServidor()` de `solucion/server.js`.
- Retos 2–5: el plugin de Vite `retos/ver-solucion.js` (en el `vite.config.js` de cada `inicio`) sirve la carpeta `solucion` en `/solucion/` (`http://localhost:300N/solucion/`).

En el reto 2, el plugin `retos/asistente/plugin.js` añade a las dos pestañas un chat con `gpt-6-luna` que usa las herramientas WebMCP de la página (`getTools()` + `executeTool()`). Va por el proxy de OpenAI del taller con el token de `retos/config.js` (o, si está vacío, el `WORKSHOP_TOKEN` de `.dev.vars`).

Cada reto tiene su puerto, `300N` (N es el número del reto), y cada demo del directo el suyo a partir del `3101` (`directo/liga/1-mcp` → 3101, `directo/liga/2-mcp-ui` → 3102). Nunca coinciden, así que puedes tenerlos todos arrancados a la vez. Si añades uno nuevo, sigue el esquema.
