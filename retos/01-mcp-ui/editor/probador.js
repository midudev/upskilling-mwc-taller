// El probador: un cliente MCP mínimo que habla con tu server.js dentro del navegador.
// Sin SDK en el lado del cliente: MCP es JSON-RPC, y una vista de MCP Apps es un iframe que habla por postMessage.
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { crearServidor } from './server.js';

const $ = (selector) => document.querySelector(selector);

function h(etiqueta, propiedades = {}, ...hijos) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...hijos.filter((hijo) => hijo != null && hijo !== false && hijo !== ''));
  return $elemento;
}

/* ───────────── Cliente MCP: el servidor y el cliente unidos por un transporte en memoria ───────────── */

const [cliente, servidor] = InMemoryTransport.createLinkedPair();
let ultimoId = 0;
const pendientes = new Map();

cliente.onmessage = (mensaje) => {
  const pendiente = pendientes.get(mensaje.id);
  if (!pendiente) return;
  pendientes.delete(mensaje.id);
  if (mensaje.error) pendiente.reject(new Error(mensaje.error.message));
  else pendiente.resolve(mensaje.result);
};

function mcp(method, params = {}) {
  const id = ++ultimoId;
  return new Promise((resolve, reject) => {
    pendientes.set(id, { resolve, reject });
    cliente.send({ jsonrpc: '2.0', id, method, params }).catch(reject);
  });
}

const textoDe = ({ content = [] } = {}) => content.map((bloque) => bloque.text ?? `[${bloque.type}]`).join('\n');

/** Lo que la vista le pide al cliente, para ver que cada paso funciona (las comprobaciones lo leen) */
const eventos = [];

/* ───────────── Cliente de MCP Apps mínimo: la vista en un iframe ───────────── */

async function leerVista(uri) {
  try {
    const { contents } = await mcp('resources/read', { uri });
    return contents?.[0] ?? null;
  } catch {
    return null;
  }
}

function montarVista(html, argumentos, resultado, uri) {
  // En un cliente de verdad el iframe está aislado (sandbox, sin acceso a la página)
  const $iframe = h('iframe', { className: 'vista', title: 'Vista de la herramienta', srcdoc: html });
  const $eventos = h('ul', { className: 'eventos' });
  const anotar = (metodo, detalle) => {
    eventos.push({ metodo, detalle });
    $eventos.append(h('li', {}, h('code', {}, metodo), detalle));
  };
  const enviar = (mensaje) => $iframe.contentWindow?.postMessage({ jsonrpc: '2.0', ...mensaje }, '*');

  const peticiones = {
    'ui/initialize': ({ protocolVersion }) => ({
      protocolVersion,
      hostInfo: { name: 'probador', version: '1.0.0' },
      hostCapabilities: { serverTools: {}, serverResources: {}, logging: {}, updateModelContext: { text: {} }, message: { text: {} } },
      hostContext: { theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline'], platform: 'web', locale: 'es-ES' },
    }),
    'tools/call': (params) => {
      anotar('tools/call', `${params.name} ${JSON.stringify(params.arguments ?? {})}`);
      return mcp('tools/call', params);
    },
    'resources/read': (params) => mcp('resources/read', params),
    'ui/update-model-context': (params) => {
      anotar('ui/update-model-context', textoDe(params));
      return {};
    },
    'ui/message': (params) => {
      anotar('ui/message', textoDe(params));
      return {};
    },
    ping: () => ({}),
  };

  const notificaciones = {
    // La vista está lista: le pasamos los argumentos y el resultado de la herramienta
    'ui/notifications/initialized': () => {
      anotar('ui/notifications/initialized', 'la vista está lista');
      enviar({ method: 'ui/notifications/tool-input', params: { arguments: argumentos } });
      enviar({ method: 'ui/notifications/tool-result', params: resultado });
    },
    'ui/notifications/size-changed': ({ height }) => {
      if (height) $iframe.style.height = `${Math.min(Math.ceil(height) + 2, 900)}px`;
    },
  };

  window.addEventListener('message', async ({ source, data }) => {
    if (source !== $iframe.contentWindow || data?.jsonrpc !== '2.0' || !data.method) return;
    const { id, method, params = {} } = data;
    if (id === undefined) {
      notificaciones[method]?.(params);
      return;
    }
    try {
      if (!peticiones[method]) throw new Error(`El probador no soporta ${method}`);
      enviar({ id, result: await peticiones[method](params) });
    } catch (error) {
      enviar({ id, error: { code: -32603, message: error.message } });
    }
  });

  return h('div', {}, h('div', { className: 'marco' }, h('p', {}, uri), $iframe), $eventos);
}

/** Llama a una herramienta y pinta lo que devuelve: la vista si la tiene, el texto si no */
async function probar(herramienta, argumentos, $destino) {
  $destino.replaceChildren(h('p', { className: 'suave' }, 'Llamando…'));
  const inicio = performance.now();
  let resultado;
  try {
    resultado = await mcp('tools/call', { name: herramienta.name, arguments: argumentos });
  } catch (error) {
    resultado = { isError: true, content: [{ type: 'text', text: error.message }] };
  }
  const ms = Math.round(performance.now() - inicio);

  const uri = herramienta._meta?.ui?.resourceUri;
  const recurso = uri && !resultado.isError ? await leerVista(uri) : null;

  const partes = [
    h(
      'p',
      { className: 'meta' },
      resultado.isError ? h('span', { className: 'error' }, '✕ isError') : h('span', { className: 'ok' }, '✓ ok'),
      h('span', { className: 'suave' }, `${ms} ms`),
      uri && h('code', { className: recurso ? 'suave' : 'error' }, recurso ? uri : `no se puede leer ${uri} (TODO 3)`),
    ),
  ];

  if (recurso?.text) partes.push(montarVista(recurso.text, argumentos, resultado, uri));
  else if (!uri && herramienta.name === 'buscar_productos') {
    partes.push(h('p', { className: 'aviso' }, 'Sin interfaz: la herramienta no tiene _meta.ui.resourceUri, así que el chat solo puede enseñar texto (TODO 1).'));
  }
  partes.push(h('details', { open: !recurso }, h('summary', {}, 'content · lo que lee el modelo'), h('pre', {}, textoDe(resultado) || '(sin texto)')));
  if (resultado.structuredContent) {
    partes.push(h('details', {}, h('summary', {}, 'structuredContent · los datos para la vista'), h('pre', {}, JSON.stringify(resultado.structuredContent, null, 2))));
  }
  $destino.replaceChildren(...partes);
}

/* ───────────── Formularios de las herramientas (a partir de su inputSchema) ───────────── */

const esNumero = (esquema) => ['number', 'integer'].includes(esquema.type);

function pintarHerramienta(herramienta) {
  const { name, description, inputSchema } = herramienta;
  const $resultado = h('div');
  const campos = Object.entries(inputSchema?.properties ?? {}).map(([nombre, esquema]) => {
    const $control = esquema.enum
      ? h('select', { name: nombre }, h('option', { value: '' }, '—'), ...esquema.enum.map((o) => h('option', { value: o }, o)))
      : h('input', { name: nombre, type: esNumero(esquema) ? 'number' : 'text', autocomplete: 'off', title: esquema.description ?? '' });
    if (nombre === 'id') $control.value = 'teclado-mecanico';
    return h('label', {}, h('span', {}, nombre), $control);
  });
  const $form = h('form', {}, ...campos, h('button', { type: 'submit' }, 'Probar ▸'));

  $form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const argumentos = {};
    for (const [nombre, esquema] of Object.entries(inputSchema?.properties ?? {})) {
      const valor = $form.elements[nombre].value.trim();
      if (valor !== '') argumentos[nombre] = esNumero(esquema) ? Number(valor) : valor;
    }
    probar(herramienta, argumentos, $resultado);
  });

  return h(
    'li',
    {},
    h('p', {}, h('code', {}, name), herramienta._meta?.ui?.resourceUri && h('span', { className: 'ui' }, 'con interfaz')),
    h('p', { className: 'suave' }, description ?? ''),
    $form,
    $resultado,
  );
}

/* ───────────── Arranque ───────────── */

// Para las comprobaciones de los pasos
window.__mcp = mcp;
window.__eventos = eventos;

await crearServidor().connect(servidor);
await cliente.start();

const { serverInfo } = await mcp('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'probador', version: '1.0.0' },
});
await cliente.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
$('#servidor').textContent = `${serverInfo.name} ${serverInfo.version} · en tu navegador`;

const { tools } = await mcp('tools/list');
$('#herramientas').replaceChildren(...tools.map(pintarHerramienta));

// Lo que haría un chat: el usuario pide algo y el modelo llama a buscar_productos
const buscar = tools.find((tool) => tool.name === 'buscar_productos');
const argumentos = { categoria: 'audio' };
const $respuesta = h('div');
$('#chat').append(
  h('p', { className: 'burbuja usuario' }, 'busca algo de audio'),
  h('div', { className: 'burbuja llamada' }, h('p', { className: 'suave' }, '◆ modelo'), h('code', {}, `buscar_productos(${JSON.stringify(argumentos)})`), $respuesta),
);
if (buscar) await probar(buscar, argumentos, $respuesta);
else $respuesta.append(h('p', { className: 'aviso' }, 'El servidor no tiene la herramienta buscar_productos.'));
