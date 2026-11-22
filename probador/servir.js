// El probador: una web para comprobar un servidor MCP desde el navegador.
// Los servidores de directo/liga y de retos/01-mcp-ui la sirven en todo lo que no es /mcp.
// En /solucion/ es la misma web, pero habla con /solucion/mcp (la pestaña «Ver solución» de los retos).
import { readFile } from 'node:fs/promises';
import { API_URL, TOKEN } from '../retos/config.js';

const ARCHIVOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/solucion/': ['index.html', 'text/html; charset=utf-8'],
  '/probador.css': ['estilos.css', 'text/css; charset=utf-8'],
  '/probador.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/marked.js': ['../node_modules/marked/lib/marked.esm.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['../public/favicon.svg', 'image/svg+xml'],
  '/fuentes/mono.woff2': ['../src/assets/fonts/GeistMono-Latin.woff2', 'font/woff2'],
  '/fuentes/pixel.woff2': ['../src/assets/fonts/GeistPixel-Square-Latin.woff2', 'font/woff2'],
};

// El token del taller para el chat: el de retos/config.js o, en el ordenador del ponente, el de .dev.vars
async function tokenDelTaller() {
  if (TOKEN) return TOKEN;
  try {
    const variables = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8');
    return variables.match(/^WORKSHOP_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1] ?? 'MIDULL';
  } catch {
    return 'MIDULL';
  }
}

export async function servirProbador(pathname, res) {
  // Lo que necesita el chat del probador para hablar con el modelo (el proxy de OpenAI del taller)
  if (pathname === '/chat.json') {
    const configuracion = { api: `${API_URL}/api/openai/v1/responses`, token: await tokenDelTaller() };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(configuracion));
    return;
  }

  const [ruta, tipo] = ARCHIVOS[pathname] ?? [];

  try {
    if (!ruta) throw new Error();
    const contenido = await readFile(new URL(ruta, import.meta.url));
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' }).end(contenido);
  } catch {
    res.writeHead(404).end('El servidor MCP está en /mcp');
  }
}
