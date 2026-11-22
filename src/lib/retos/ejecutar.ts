// Ejecuta los archivos del editor en un iframe, sin servidor ni bundler:
// - cada .js se convierte en un módulo blob: y sus imports relativos ('./tienda.js') pasan a '@reto/tienda.js',
//   que un import map lleva al blob de ese archivo;
// - los paquetes de npm ('zod', 'runonweb/embed'…) van a public/retos/vendor/ por el mismo import map;
// - el HTML de entrada se escribe en el srcdoc del iframe, con los estilos en línea y un script que
//   reenvía a la página la consola y los errores.
// El iframe es del mismo origen que la web: las comprobaciones leen su `window` directamente.
import consolaRuntime from './runtime/consola.js?raw';
import webmcpRuntime from './runtime/webmcp.js?raw';
import { CARPETA_VENDOR, PAQUETES } from './paquetes.js';

export const PRELUDIOS: Record<string, string> = { webmcp: webmcpRuntime };

export interface Ejecucion {
  id: string;
  iframe: HTMLIFrameElement;
  /** blob: → ruta del archivo, para traducir los errores */
  rutas: Map<string, string>;
  /** Se resuelve cuando la página ha cargado (evento load) */
  cargada: Promise<void>;
  cerrar(): void;
}

export interface OpcionesEjecucion {
  archivos: Map<string, string>;
  entrada: string;
  /** Scripts clásicos que se ejecutan antes que nada (por ejemplo, la API de WebMCP) */
  preludios?: string[];
  /** Módulos que sustituyen a un paquete ('runonweb/embed') o a un archivo ('@reto/config.js'). Para las comprobaciones */
  falsos?: Record<string, string>;
  contenedor: HTMLElement;
  oculto?: boolean;
}

const RELATIVO = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g;

/** 'vista/app.js' + '../tienda.js' → 'tienda.js' */
export function resolver(desde: string, relativo: string) {
  const partes = desde.split('/').slice(0, -1);
  for (const trozo of relativo.split('/')) {
    if (trozo === '..') partes.pop();
    else if (trozo !== '.') partes.push(trozo);
  }
  return partes.join('/');
}

/** Cambia los imports relativos por '@reto/<ruta>' sin mover ninguna línea (los errores mantienen su número) */
export function reescribirImports(ruta: string, codigo: string) {
  return codigo.replace(RELATIVO, (_, antes, comilla, relativo) => `${antes}${comilla}@reto/${resolver(ruta, relativo)}${comilla}`);
}

const blob = (codigo: string, tipo = 'text/javascript') => URL.createObjectURL(new Blob([codigo], { type: tipo }));

const absoluta = (ruta: string) => new URL(ruta, location.origin).href;

/** El HTML de una página con sus estilos en línea y los scripts de módulo apuntando a blobs */
function prepararHtml(
  html: string,
  ruta: string,
  archivos: Map<string, string>,
  urls: Map<string, string>,
  cabecera: string,
) {
  const documento = new DOMParser().parseFromString(html, 'text/html');

  for (const $link of documento.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')) {
    const href = $link.getAttribute('href')!;
    if (!href.startsWith('.')) continue;
    const $style = documento.createElement('style');
    $style.textContent = archivos.get(resolver(ruta, href)) ?? '';
    $link.replaceWith($style);
  }

  for (const $script of documento.querySelectorAll<HTMLScriptElement>('script[src]')) {
    const src = $script.getAttribute('src')!;
    if (!src.startsWith('.')) continue;
    const url = urls.get(resolver(ruta, src));
    if (url) $script.setAttribute('src', url);
  }

  documento.head.insertAdjacentHTML('afterbegin', cabecera);
  return `<!doctype html>\n${documento.documentElement.outerHTML}`;
}

export function ejecutar({ archivos, entrada, preludios = [], falsos = {}, contenedor, oculto = false }: OpcionesEjecucion): Ejecucion {
  const id = crypto.randomUUID();
  const urls = new Map<string, string>(); // ruta → blob:
  const rutas = new Map<string, string>(); // blob: → ruta
  const imports: Record<string, string> = {};

  for (const [especificador, archivo] of Object.entries(PAQUETES)) {
    imports[especificador] = absoluta(`${CARPETA_VENDOR}/${archivo}.js`);
  }

  for (const [ruta, codigo] of archivos) {
    if (!ruta.endsWith('.js')) continue;
    const url = blob(reescribirImports(ruta, codigo));
    urls.set(ruta, url);
    rutas.set(url, ruta);
    imports[`@reto/${ruta}`] = url;
  }

  for (const [especificador, codigo] of Object.entries(falsos)) {
    const url = blob(codigo);
    rutas.set(url, `${especificador} (falso)`);
    imports[especificador] = url;
  }

  const escapar = (codigo: string) => codigo.replaceAll('</script', '<\\/script');
  const cabecera = [
    `<base href="${location.origin}/">`,
    `<script type="importmap">${escapar(JSON.stringify({ imports }))}</script>`,
    `<script>${escapar(consolaRuntime.replace('__RETO_ID__', id))}</script>`,
    ...preludios.map((nombre) => `<script>${escapar((PRELUDIOS[nombre] ?? '').replace('__RETO_ID__', id))}</script>`),
  ].join('\n');

  const html = prepararHtml(archivos.get(entrada) ?? '<p>Falta el archivo de entrada</p>', entrada, archivos, urls, cabecera);

  const iframe = document.createElement('iframe');
  iframe.title = oculto ? 'Comprobaciones' : 'Resultado';
  iframe.className = oculto ? 'iframe-comprobaciones' : 'iframe-resultado';
  iframe.setAttribute('allow', 'microphone; clipboard-write');
  if (oculto) iframe.setAttribute('aria-hidden', 'true');

  const cargada = new Promise<void>((resolve) => iframe.addEventListener('load', () => resolve(), { once: true }));
  iframe.srcdoc = html;
  contenedor.append(iframe);

  return {
    id,
    iframe,
    rutas,
    cargada,
    cerrar() {
      iframe.remove();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      for (const url of rutas.keys()) URL.revokeObjectURL(url);
    },
  };
}

/** Traduce los blob: de un mensaje de error al nombre del archivo */
export function traducir(texto: string, rutas: Map<string, string>) {
  let resultado = texto;
  for (const [url, ruta] of rutas) resultado = resultado.replaceAll(url, ruta);
  return resultado.replaceAll('@reto/', '');
}
