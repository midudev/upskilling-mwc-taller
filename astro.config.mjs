// @ts-check
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { vendorDeLosRetos } from './scripts/vendor-retos.mjs';
import { PAQUETES } from './src/lib/retos/paquetes.js';

// Fuentes subseteadas con `pnpm fonts` (scripts/subset-fonts.sh). Astro las sirve con hash en
// /_astro/fonts/ (caché inmutable), inyecta el @font-face en línea y genera fallbacks con métricas
// ajustadas para evitar saltos de layout mientras cargan.
const fallbacks = ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'];

// /directo/mario: la ROM vive en games/ (ignorado por git) y solo la sirve el servidor de desarrollo.
// En el deploy no está: la página pide arrastrar el .nes y lo guarda en el navegador.
const MARIO_ROM = 'Super Mario Bros. (World).nes';
const MARIO_ROM_URL = '/games/super-mario-bros.nes';

function romDeMario() {
  return {
    name: 'rom-de-mario',
    /** @param {{ config: { root: string }, middlewares: { use(fn: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void): void } }} server */
    configureServer(server) {
      const archivo = path.join(server.config.root, 'games', MARIO_ROM);
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== MARIO_ROM_URL) return next();
        if (!existsSync(archivo)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('cache-control', 'no-store');
        createReadStream(archivo).pipe(res);
      });
    },
  };
}

// Transformers.js (los workers de Whisper y del chat local, y los módulos de runonweb) empaqueta
// onnxruntime-web, cuyo wasm de respaldo (25,6 MiB) supera el límite de archivos de Workers.
// Transformers.js y runonweb lo cargan siempre desde jsDelivr, así que esa copia no se usa: se quita del build.
function sinWasmDeOnnx() {
  return {
    name: 'sin-wasm-de-onnx',
    /** @param {unknown} _ @param {Record<string, unknown>} bundle */
    generateBundle(_, bundle) {
      for (const nombre of Object.keys(bundle)) {
        if (/(^|\/)ort-wasm-[^/]*\.wasm$/.test(nombre)) delete bundle[nombre];
      }
    },
  };
}

// Bug de Astro 7.4 (astro:fonts): cuando el plugin de Cloudflare reinicia Vite (cambios en .dev.vars,
// wrangler.jsonc, reinicio de workerd…) se reutiliza la misma instancia del plugin de fuentes. El
// buildStart del servidor nuevo corre ANTES que el buildEnd del viejo, y ese buildEnd vacía el estado
// compartido: /_astro/fonts/* pasa a dar 404 y la web cae al fallback (Courier). En dev ese buildEnd
// solo hace limpieza, así que lo saltamos; en el build sigue igual (es el que copia las fuentes a dist).
function fuentesTrasReiniciar() {
  const PARCHEADO = Symbol.for('taller:fuentes-tras-reiniciar');
  return {
    name: 'fuentes-tras-reiniciar',
    /** @param {{ plugins: readonly any[] }} config */
    configResolved(config) {
      const fuentes = config.plugins.find((p) => p.name === 'astro:fonts');
      if (typeof fuentes?.buildEnd !== 'function' || fuentes.buildEnd[PARCHEADO]) return;
      const original = fuentes.buildEnd;
      /** @this {{ environment: { config: { command: string } } }} @param {unknown[]} args */
      const buildEnd = function (...args) {
        if (this.environment.config.command === 'serve') return;
        return original.apply(this, args);
      };
      buildEnd[PARCHEADO] = true;
      fuentes.buildEnd = buildEnd;
    },
  };
}

// El editor de /retos ejecuta tu código en el navegador: los paquetes de npm que importa (el SDK de MCP,
// Transformers.js, runonweb…) se empaquetan en public/retos/vendor antes de arrancar o compilar.
function vendorRetos() {
  return {
    name: 'vendor-retos',
    hooks: {
      /** @param {{ logger: { info(m: string): void } }} opciones */
      'astro:config:setup': ({ logger }) => vendorDeLosRetos({ log: logger }),
    },
  };
}

// Las páginas se prerenderizan (estáticas). Solo /api/* (y /directo/entradas) se ejecutan en el Worker.
export default defineConfig({
  adapter: cloudflare(),
  // agenda.html en vez de agenda/index.html: Cloudflare sirve /agenda directamente (200) en lugar de
  // redirigir con un 307 a /agenda/, que añadía un round-trip antes del HTML (y de las fuentes)
  build: { format: 'file' },
  // Las APIs se llaman desde otros orígenes y se protegen con el token del taller
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  markdown: {
    shikiConfig: { theme: 'css-variables' },
  },
  // El traductor de /directo/traductor es un componente de React (client:only)
  integrations: [react(), vendorRetos()],
  vite: {
    plugins: [romDeMario(), fuentesTrasReiniciar(), sinWasmDeOnnx()],
    // Los workers de Mario (futuros simulados), de Whisper y del chat local son módulos ES
    worker: { format: 'es', plugins: () => [sinWasmDeOnnx()] },
    // Sin esto, Vite descubre estas dependencias al abrir la página y recarga a mitad de la demo
    optimizeDeps: {
      // Los archivos de los retos (retos/*/editor) importan paquetes que se ejecutan en el iframe del editor,
      // no en la web: los sirve public/retos/vendor. Vite los encuentra al rastrear el proyecto y no debe tocarlos
      exclude: Object.keys(PAQUETES).filter((paquete) => paquete.startsWith('@modelcontextprotocol/') || ['runonweb/embed', 'runonweb/stt'].includes(paquete)),
      include: [
        'jsnes',
        '@huggingface/transformers',
        'marked',
        'runonweb/translate',
        'runonweb/remove-bg',
        'runonweb/caption',
        'runonweb/emoji',
        'runonweb/tts',
      ],
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Geist Pixel',
      cssVariable: '--font-pixel',
      fallbacks,
      options: {
        variants: [{ src: ['./src/assets/fonts/GeistPixel-Square-Latin.woff2'], weight: '400 500', style: 'normal' }],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Mono',
      cssVariable: '--font-mono',
      fallbacks,
      options: {
        variants: [{ src: ['./src/assets/fonts/GeistMono-Latin.woff2'], weight: '400 700', style: 'normal' }],
      },
    },
  ],
});
