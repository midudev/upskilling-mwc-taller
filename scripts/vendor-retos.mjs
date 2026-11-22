// Empaqueta para el navegador las dependencias que usa el código de los retos en el editor de /retos
// (el SDK de MCP, Transformers.js, runonweb…). Salen como módulos ES en public/retos/vendor/, con los
// trozos comunes separados para que, por ejemplo, zod sea el mismo para tu servidor y para el SDK.
//
// Lo lanza la integración `vendor-retos` de astro.config.mjs al arrancar `astro dev` o `astro build`.
// Solo vuelve a empaquetar si han cambiado los lockfiles o este script. A mano: node scripts/vendor-retos.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { CARPETA_VENDOR, PAQUETES } from '../src/lib/retos/paquetes.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'public', CARPETA_VENDOR);
const VERSION = path.join(SALIDA, '.version');

function huella() {
  const hash = createHash('sha256');
  for (const archivo of ['pnpm-lock.yaml', 'package-lock.json', 'bun.lock', 'scripts/vendor-retos.mjs', 'src/lib/retos/paquetes.js']) {
    const ruta = path.join(RAIZ, archivo);
    if (existsSync(ruta)) hash.update(readFileSync(ruta));
  }
  return hash.digest('hex');
}

export async function vendorDeLosRetos({ forzar = false, log = console } = {}) {
  const actual = huella();
  if (!forzar && existsSync(VERSION) && readFileSync(VERSION, 'utf8') === actual) return;

  const inicio = performance.now();
  rmSync(SALIDA, { recursive: true, force: true });
  mkdirSync(SALIDA, { recursive: true });

  await build({
    entryPoints: Object.entries(PAQUETES).map(([paquete, archivo]) => ({ in: `vendor:${paquete}`, out: archivo })),
    plugins: [
      {
        name: 'vendor',
        setup(esbuild) {
          // Cada entrada es un módulo virtual que reexporta el paquete, resuelto desde su carpeta
          esbuild.onResolve({ filter: /^vendor:/ }, ({ path: ruta }) => ({ path: ruta.slice(7), namespace: 'vendor' }));
          esbuild.onLoad({ filter: /.*/, namespace: 'vendor' }, ({ path: paquete }) => ({
            contents: `export * from ${JSON.stringify(paquete)};`,
            resolveDir: RAIZ,
          }));
        },
      },
    ],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    outdir: SALIDA,
    logLevel: 'warning',
  });

  writeFileSync(VERSION, actual);
  log.info?.(`[vendor-retos] ${Object.keys(PAQUETES).length} paquetes en ${CARPETA_VENDOR} (${Math.round(performance.now() - inicio)} ms)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await vendorDeLosRetos({ forzar: true });
}
