// El probador: un cliente MCP mínimo que habla con tu server.js dentro del navegador.
// Incluye un chat interactivo (con el modelo del taller si hay token, o simulado en local si no)
// y comprueba en vivo el estado de cada herramienta y sus puntos de MCP Apps.
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { productos as catalogo } from './productos.js';
import { crearServidor } from './server.js';

const API_URL = '__URL_DEL_TALLER__';
const URI_CATALOGO = 'ui://tienda/catalogo.html';
const MAX_VUELTAS = 6;

const $ = (selector) => document.querySelector(selector);

function h(etiqueta, propiedades = {}, ...hijos) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...hijos.filter((hijo) => hijo != null && hijo !== false && hijo !== ''));
  return $elemento;
}

const normalizar = (texto = '') =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/* ───────────── Token del taller (leído de la web principal) ───────────── */

function obtenerToken() {
  try {
    return (window.parent?.localStorage?.getItem('taller:token') ?? localStorage.getItem('taller:token') ?? '').trim();
  } catch {
    return '';
  }
}

function pedirToken() {
  try {
    window.parent.dispatchEvent(new CustomEvent('taller:pedir-token'));
  } catch {}
}

function urlApi(ruta) {
  const base = API_URL.startsWith('http') ? API_URL : document.baseURI;
  return new URL(ruta, base).href;
}

/* ───────────── Cliente MCP: servidor y cliente unidos por transporte en memoria ───────────── */

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

/** Último estado conocido del carrito (para informar al modelo y al modo local) */
let ultimoCarrito = { lineas: [], unidades: 0, total: 0 };

function registrarCarrito(resultado) {
  const sc = resultado?.structuredContent;
  if (!sc) return;
  if (sc.carrito && 'unidades' in sc.carrito) ultimoCarrito = sc.carrito;
  else if ('unidades' in sc && 'total' in sc) ultimoCarrito = sc;
}

/* ───────────── Diagnóstico de herramientas y checks de cada punto ───────────── */

const diagnostico = {
  tools: [],
  buscarResultado: null,
  recursoCatalogo: null,
  vistaPintada: false,
  callServerToolConfirmado: false,
};

function recursoTieneCallServerTool(html = '') {
  return (
    /callServerTool\s*\(\s*\{[\s\S]*?name\s*:\s*['"`]anadir_al_carrito['"`][\s\S]*?id\s*:\s*producto\.id/.test(html) &&
    !/callServerTool\s*\([^)]*___/.test(html)
  );
}

function evaluarHerramienta(herramienta) {
  if (herramienta.name === 'buscar_productos') {
    const uri = herramienta._meta?.ui?.resourceUri;
    const tieneUri = uri === URI_CATALOGO;
    const sc = diagnostico.buscarResultado?.structuredContent;
    const tieneDatos =
      Boolean(diagnostico.buscarResultado && !diagnostico.buscarResultado.isError) &&
      Array.isArray(sc?.productos) &&
      sc.productos.length > 0 &&
      Boolean(sc?.carrito && 'unidades' in sc.carrito);
    const rec = diagnostico.recursoCatalogo;
    const tieneRecurso =
      rec?.uri === URI_CATALOGO &&
      rec?.mimeType === 'text/html;profile=mcp-app' &&
      Boolean(rec?.text?.includes('id="productos"'));
    const vistaOk = diagnostico.vistaPintada;
    const botonOk =
      diagnostico.callServerToolConfirmado || (tieneRecurso && recursoTieneCallServerTool(rec?.text ?? ''));

    const checks = [
      { id: 'uri', ok: tieneUri, texto: 'Enlaza su vista en _meta.ui.resourceUri', todo: 'TODO 1' },
      { id: 'datos', ok: tieneDatos, texto: 'Devuelve structuredContent con productos y carrito', todo: 'TODO 2' },
      { id: 'recurso', ok: tieneRecurso, texto: 'Sirve el recurso ui:// con HTML de MCP Apps', todo: 'TODO 3' },
      { id: 'vista', ok: vistaOk, texto: 'La vista pinta el catálogo al recibir toolresult', todo: 'TODO 4' },
      { id: 'accion', ok: botonOk, texto: 'El botón «Añadir» llama a anadir_al_carrito', todo: 'TODO 5' },
    ];
    return { ok: checks.every((c) => c.ok), checks, conInterfaz: Boolean(uri) };
  }

  if (herramienta.name === 'anadir_al_carrito') {
    const props = herramienta.inputSchema?.properties ?? {};
    const checks = [
      { id: 'esquema', ok: Boolean(props.id && props.cantidad), texto: 'Define parámetros id y cantidad' },
      { id: 'desc', ok: Boolean(herramienta.description?.trim()), texto: 'Tiene descripción para el modelo' },
    ];
    return { ok: checks.every((c) => c.ok), checks, conInterfaz: Boolean(herramienta._meta?.ui?.resourceUri) };
  }

  const checks = [
    { id: 'esquema', ok: Boolean(herramienta.inputSchema), texto: 'Define su esquema de entrada' },
    { id: 'desc', ok: Boolean(herramienta.description?.trim()), texto: 'Tiene descripción para el modelo' },
  ];
  return { ok: checks.every((c) => c.ok), checks, conInterfaz: Boolean(herramienta._meta?.ui?.resourceUri) };
}

function actualizarResumenHerramientas() {
  const total = diagnostico.tools.length;
  const evaluaciones = diagnostico.tools.map((tool) => ({ tool, eval: evaluarHerramienta(tool) }));
  const correctas = evaluaciones.filter(({ eval: e }) => e.ok).length;

  const estado = total === 0 ? 'error' : correctas === total ? 'ok' : correctas > 0 ? 'parcial' : 'error';
  const $badge = $('#resumen-herramientas');
  $badge.dataset.estado = estado;
  $badge.textContent =
    total === 0
      ? '✕ 0 herramientas detectadas'
      : `${correctas === total ? '✓ ' : ''}${correctas}/${total} ${total === 1 ? 'herramienta correcta' : 'herramientas correctas'}`;

  const $contador = $('#herramientas-contador');
  $contador.dataset.estado = estado;
  $contador.textContent =
    total === 0 ? 'Sin herramientas registradas' : `${correctas} de ${total} listas`;

  // Actualiza el estado visual de cada tarjeta sin borrar los formularios ni resultados manuales
  for (const { tool, eval: ev } of evaluaciones) {
    const $card = document.querySelector(`.herramienta-card[data-tool="${CSS.escape(tool.name)}"]`);
    if (!$card) continue;
    $card.dataset.estado = ev.ok ? 'ok' : 'pendiente';

    const $icono = $card.querySelector('.check-icono');
    $icono.className = `check-icono ${ev.ok ? 'ok' : 'pendiente'}`;
    $icono.textContent = ev.ok ? '✓' : '!';
    $icono.title = ev.ok ? 'Herramienta correcta' : 'Faltan puntos por completar';

    const hechos = ev.checks.filter((c) => c.ok).length;
    const $progreso = $card.querySelector('.etiqueta-progreso');
    $progreso.className = `etiqueta etiqueta-progreso ${ev.ok ? 'ok' : 'pendiente'}`;
    $progreso.textContent = ev.ok ? 'correcta' : `${hechos}/${ev.checks.length} checks`;

    const $checks = $card.querySelector('.checks');
    $checks.replaceChildren(
      ...ev.checks.map((check) => {
        const $li = h(
          'li',
          {},
          h('span', { className: 'marca', ariaHidden: 'true' }, check.ok ? '✓' : '○'),
          h('span', { className: 'texto-check' }, check.texto),
          check.todo && h('span', { className: 'todo-tag' }, check.todo),
        );
        $li.dataset.ok = String(check.ok);
        return $li;
      }),
    );
  }
}

/* ───────────── Cliente de MCP Apps mínimo: la vista en un iframe ───────────── */

async function leerVista(uri) {
  try {
    const { contents } = await mcp('resources/read', { uri });
    return contents?.[0] ?? null;
  } catch {
    return null;
  }
}

function vigilarVistaPintada($iframe) {
  if (diagnostico.vistaPintada) return;
  let intentos = 0;
  const revisar = () => {
    intentos++;
    try {
      const doc = $iframe.contentDocument;
      if (doc && doc.querySelectorAll('#productos li').length > 0) {
        diagnostico.vistaPintada = true;
        actualizarResumenHerramientas();
        return;
      }
    } catch {}
    if (intentos < 40 && !diagnostico.vistaPintada) setTimeout(revisar, 120);
  };
  setTimeout(revisar, 100);
}

function montarVista(html, argumentos, resultado, uri, { alContexto, alMensaje, signal } = {}) {
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
    'tools/call': async (params) => {
      anotar('tools/call', `${params.name} ${JSON.stringify(params.arguments ?? {})}`);
      const res = await mcp('tools/call', params);
      registrarCarrito(res);
      if (params.name === 'anadir_al_carrito' && !res.isError && !diagnostico.callServerToolConfirmado) {
        diagnostico.callServerToolConfirmado = true;
        actualizarResumenHerramientas();
      }
      return res;
    },
    'resources/read': (params) => mcp('resources/read', params),
    'ui/update-model-context': (params) => {
      const texto = textoDe(params);
      anotar('ui/update-model-context', texto);
      alContexto?.(texto);
      return {};
    },
    'ui/message': (params) => {
      const texto = textoDe(params);
      anotar('ui/message', texto);
      alMensaje?.(texto);
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
      if (uri === URI_CATALOGO) vigilarVistaPintada($iframe);
    },
    'ui/notifications/size-changed': ({ height }) => {
      if (height) $iframe.style.height = `${Math.min(Math.ceil(height) + 2, 900)}px`;
    },
  };

  window.addEventListener(
    'message',
    async ({ source, data }) => {
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
    },
    signal ? { signal } : undefined,
  );

  return h('div', {}, h('div', { className: 'marco' }, h('p', {}, uri), $iframe), $eventos);
}

/** Llama a una herramienta y pinta lo que devuelve: la vista si la tiene, el texto si no */
async function probar(herramienta, argumentos, $destino, opcionesVista = {}) {
  $destino.replaceChildren(h('p', { className: 'suave' }, 'Llamando…'));
  const inicio = performance.now();
  let resultado;
  try {
    resultado = await mcp('tools/call', { name: herramienta.name, arguments: argumentos });
  } catch (error) {
    resultado = { isError: true, content: [{ type: 'text', text: error.message }] };
  }
  const ms = Math.round(performance.now() - inicio);
  registrarCarrito(resultado);

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

  if (recurso?.text) partes.push(montarVista(recurso.text, argumentos, resultado, uri, opcionesVista));
  else if (!uri && herramienta.name === 'buscar_productos') {
    partes.push(h('p', { className: 'aviso' }, 'Sin interfaz: la herramienta no tiene _meta.ui.resourceUri, así que el chat solo puede enseñar texto (TODO 1).'));
  }
  partes.push(h('details', { open: !recurso }, h('summary', {}, 'content · lo que lee el modelo'), h('pre', {}, textoDe(resultado) || '(sin texto)')));
  if (resultado.structuredContent) {
    partes.push(h('details', {}, h('summary', {}, 'structuredContent · los datos para la vista'), h('pre', {}, JSON.stringify(resultado.structuredContent, null, 2))));
  }
  $destino.replaceChildren(...partes);
  return { resultado, recurso };
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

  const $card = h(
    'li',
    { className: 'herramienta-card' },
    h(
      'p',
      { className: 'herramienta-titulo' },
      h('span', { className: 'check-icono pendiente', ariaHidden: 'true' }, '·'),
      h('code', {}, name),
      herramienta._meta?.ui?.resourceUri && h('span', { className: 'etiqueta ok' }, 'con interfaz'),
      h('span', { className: 'etiqueta etiqueta-progreso' }, 'comprobando…'),
    ),
    h('p', { className: 'suave herramienta-desc' }, description ?? ''),
    h('ul', { className: 'checks' }),
    $form,
    $resultado,
  );
  $card.dataset.tool = name;
  return $card;
}

/* ───────────── Formato seguro de respuestas de texto ───────────── */

function nodosEnLinea(texto) {
  const partes = [];
  const patron = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let ultimo = 0;
  for (const match of texto.matchAll(patron)) {
    if (match.index > ultimo) partes.push(texto.slice(ultimo, match.index));
    const token = match[0];
    if (token.startsWith('**')) partes.push(h('strong', {}, token.slice(2, -2)));
    else partes.push(h('code', {}, token.slice(1, -1)));
    ultimo = match.index + token.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

function pintarTextoModelo(texto) {
  const $contenedor = h('div', { className: 'texto-modelo' });
  const bloques = texto.trim().split(/\n{2,}/);
  for (const bloque of bloques) {
    const lineas = bloque.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lineas.every((l) => /^[-*•]\s+/.test(l))) {
      $contenedor.append(h('ul', {}, ...lineas.map((l) => h('li', {}, ...nodosEnLinea(l.replace(/^[-*•]\s+/, ''))))));
    } else {
      const hijos = [];
      lineas.forEach((linea, i) => {
        if (i > 0) hijos.push(h('br'));
        hijos.push(...nodosEnLinea(linea));
      });
      $contenedor.append(h('p', {}, ...hijos));
    }
  }
  return $contenedor;
}

/* ───────────── Chat interactivo (modelo real del taller + fallback local) ───────────── */

const $chat = $('#chat');
const $pensando = $('#pensando');
const $pregunta = $('#pregunta');
const $modoChat = $('#modo-chat');
const $ponerToken = $('#poner-token');
const $nuevaChat = $('#nueva-chat');
const $sugerencias = $('#sugerencias');

const chat = {
  historial: [],
  contexto: '',
  vistas: new AbortController(),
  ocupado: false,
};

function sincronizarModoChat() {
  const tieneToken = Boolean(obtenerToken());
  $modoChat.dataset.modo = tieneToken ? 'ia' : 'local';
  $modoChat.textContent = tieneToken ? '◆ IA del taller' : '◆ modo local';
  $modoChat.title = tieneToken
    ? 'Usa el modelo del taller (/api/openai/v1/responses) con las herramientas de tu servidor MCP'
    : 'Sin token del taller: interpreta tus mensajes en local para probar las herramientas';
  $ponerToken.hidden = tieneToken;
}

function añadirAlChat($elemento) {
  $chat.append($elemento);
  $chat.scrollTop = $chat.scrollHeight;
}

function pintarRespuestaAsistente(texto) {
  añadirAlChat(
    h(
      'div',
      { className: 'burbuja asistente' },
      h('p', { className: 'quien' }, '◆ modelo'),
      pintarTextoModelo(texto),
    ),
  );
}

const aFuncion = ({ name, description, inputSchema }) => ({
  type: 'function',
  name,
  description: description ?? '',
  parameters: inputSchema ?? { type: 'object', properties: {} },
  strict: false,
});

function resumenCarritoParaModelo() {
  if (!ultimoCarrito.unidades) return 'Estado actual del carrito: vacío (0 unidades, 0 €).';
  const detalle = ultimoCarrito.lineas.map((l) => `${l.cantidad} × ${l.nombre} (${l.subtotal} €)`).join(', ');
  return `Estado actual del carrito: ${ultimoCarrito.unidades} unidades, total ${ultimoCarrito.total} € (${detalle}).`;
}

async function llamarAlModelo(tools, token) {
  const instrucciones = [
    'Eres el asistente de compras de una tienda de tecnología conectado a su servidor MCP.',
    'Responde en español, de forma breve y clara (2 o 3 frases como máximo).',
    'Usa siempre las herramientas del servidor para buscar productos o añadir al carrito; no inventes productos ni precios.',
    'Si llamas a buscar_productos y tiene interfaz gráfica, el usuario ya ve las tarjetas interactivas en el chat, así que resume brevemente sin repetir todo el listado.',
    resumenCarritoParaModelo(),
    chat.contexto && `Última acción del usuario en la interfaz: ${chat.contexto}`,
  ];

  const respuesta = await fetch(urlApi('/api/openai/v1/responses'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reasoning: { effort: 'low' },
      store: false,
      instructions: instrucciones.filter(Boolean).join('\n'),
      input: chat.historial,
      tools: tools.length ? tools.map(aFuncion) : undefined,
    }),
  });

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const err = new Error(datos.error?.message ?? `El modelo ha respondido con un ${respuesta.status}`);
    err.status = respuesta.status;
    throw err;
  }
  return datos.output ?? [];
}

const textoDelModelo = (output) =>
  output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((parte) => parte.type === 'output_text')
    .map((parte) => parte.text)
    .join('');

async function ejecutarLlamadaEnChat(herramienta, argumentos, callId) {
  const $respuesta = h('div');
  añadirAlChat(
    h(
      'div',
      { className: 'burbuja llamada' },
      h('p', { className: 'quien' }, '◆ modelo'),
      h('code', {}, `${herramienta.name}(${JSON.stringify(argumentos)})`),
      $respuesta,
    ),
  );

  const { resultado, recurso } = await probar(herramienta, argumentos, $respuesta, {
    alContexto: (texto) => (chat.contexto = texto),
    alMensaje: enviarAlChat,
    signal: chat.vistas.signal,
  });

  if (callId) {
    chat.historial.push({ type: 'function_call', call_id: callId, name: herramienta.name, arguments: JSON.stringify(argumentos) });
    chat.historial.push({ type: 'function_call_output', call_id: callId, output: textoDe(resultado) || '(sin texto)' });
  }
  $chat.scrollTop = $chat.scrollHeight;
  return { resultado, recurso };
}

/* ───────────── Modo local (cuando no hay token del taller) ───────────── */

const SINONIMOS_CATEGORIA = [
  ['audio', ['audio', 'sonido', 'musica', 'escuchar', 'podcast', 'streaming']],
  ['escritorio', ['escritorio', 'oficina', 'setup', 'trabajar', 'teletrabajo', 'pc', 'ordenador']],
  ['viaje', ['viaje', 'viajar', 'maleta', 'vuelo', 'avion', 'mochila', 'escapada']],
  ['hogar', ['hogar', 'casa', 'cafe', 'luz', 'iluminacion']],
];

const CANTIDADES = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
const STOPWORDS = new Set([
  'busca', 'buscar', 'buscame', 'muestra', 'muestrame', 'ensena', 'ensename', 'ver', 'dame', 'quiero', 'necesito',
  'tienes', 'teneis', 'hay', 'algo', 'algun', 'alguno', 'alguna', 'algunos', 'algunas', 'unos', 'unas', 'un', 'una',
  'el', 'la', 'los', 'las', 'de', 'del', 'para', 'por', 'con', 'sin', 'en', 'que', 'me', 'te', 'se', 'a', 'y', 'o',
  'productos', 'producto', 'cosas', 'cosa', 'catalogo', 'tienda', 'todo', 'todos', 'todas', 'menos', 'mas', 'bajo',
  'debajo', 'hasta', 'maximo', 'max', 'euro', 'euros', 'barato', 'baratos', 'barata', 'baratas', 'economico', 'economicos',
]);

function buscarProductoMencionado(textoNorm) {
  let mejor = null;
  let puntosMejor = 0;
  for (const prod of catalogo) {
    if (textoNorm.includes(prod.id)) return prod;
    const palabrasProd = normalizar(prod.nombre).split(/\s+/).filter((w) => w.length >= 4);
    const coincidencias = palabrasProd.filter((w) => textoNorm.includes(w) || textoNorm.includes(w.replace(/s$/, ''))).length;
    if (coincidencias > puntosMejor) {
      puntosMejor = coincidencias;
      mejor = prod;
    }
  }
  return puntosMejor > 0 ? mejor : null;
}

function extraerFiltros(texto) {
  const norm = normalizar(texto);
  const argumentos = {};

  // Precio máximo: "menos de 50", "hasta 60 €", "< 80", "50€", "barato"
  const matchPrecio =
    norm.match(/(?:menos de|por debajo de|hasta|maximo|max|<|<=)\s*(\d+)/) ?? norm.match(/(\d+)\s*(?:€|euros?)\b/);
  if (matchPrecio) {
    argumentos.precioMaximo = Number(matchPrecio[1]);
  } else if (/\bbarat[oa]s?\b|\beconomic[oa]s?\b/.test(norm)) {
    argumentos.precioMaximo = 50;
  }

  // Categoría explícita o por sinónimo
  for (const [cat, palabras] of SINONIMOS_CATEGORIA) {
    if (palabras.some((p) => new RegExp(`\\b${p}\\b`).test(norm))) {
      argumentos.categoria = cat;
      break;
    }
  }

  // Texto libre restante (si no pide "todo" o una categoría exacta)
  const palabras = norm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
  const palabrasSinCat = palabras.filter((w) => !SINONIMOS_CATEGORIA.some(([, lista]) => lista.includes(w)));

  // Si la palabra coincide directamente con un producto específico, buscamos por texto (sin restringir de más)
  const palabrasUtiles = palabrasSinCat.filter((w) => w !== argumentos.categoria);
  if (palabrasUtiles.length) {
    // Quitamos plural simple para mejorar coincidencia ("teclados" → "teclado", "altavoces" → "altavoz")
    const limpias = palabrasUtiles.map((w) =>
      w.endsWith('ces') && w.length > 4
        ? `${w.slice(0, -3)}z`
        : w.endsWith('es') && w.length > 5
          ? w.slice(0, -2)
          : w.endsWith('s') && w.length > 4 && !w.endsWith('is')
            ? w.slice(0, -1)
            : w,
    );
    argumentos.texto = limpias.join(' ');
    if (argumentos.categoria && !buscarProductoMencionado(norm)) {
      // Mantiene ambos si hay categoría y texto
    } else if (buscarProductoMencionado(norm)) {
      delete argumentos.categoria;
    }
  }

  return argumentos;
}

async function responderEnLocal(texto, tools) {
  const norm = normalizar(texto);
  const buscar = tools.find((t) => t.name === 'buscar_productos');
  const anadir = tools.find((t) => t.name === 'anadir_al_carrito');
  const responder = (mensaje) => {
    chat.historial.push({ role: 'assistant', content: mensaje });
    pintarRespuestaAsistente(mensaje);
  };

  // 1. Pregunta sobre el carrito
  if (/\b(carrito|cesta|total|llevo)\b/.test(norm) && !/\b(anad|agreg|pon|met|compr)/.test(norm)) {
    if (!ultimoCarrito.unidades) {
      responder('El carrito está vacío ahora mismo (**0 unidades · 0 €**). Puedes añadir cualquier producto desde las tarjetas o pidiéndomelo aquí.');
    } else {
      const lista = ultimoCarrito.lineas.map((l) => `- **${l.nombre}** × ${l.cantidad} — ${l.subtotal} €`).join('\n');
      responder(`Llevas **${ultimoCarrito.unidades} ${ultimoCarrito.unidades === 1 ? 'unidad' : 'unidades'}** en el carrito (**${ultimoCarrito.total} €** en total):\n\n${lista}`);
    }
    return;
  }

  // 2. Añadir un producto al carrito
  if (/\b(anade|anadir|agrega|agregar|pon|poner|mete|meter|compra|comprar)\b/.test(norm)) {
    const prod = buscarProductoMencionado(norm);
    if (anadir && prod) {
      const matchNum = norm.match(/\b(\d+|dos|tres|cuatro|cinco)\b/);
      const cantidad = matchNum ? Number(CANTIDADES[matchNum[1]] ?? matchNum[1]) : 1;
      const { resultado } = await ejecutarLlamadaEnChat(anadir, { id: prod.id, cantidad: Math.min(Math.max(cantidad, 1), 10) });
      if (!resultado.isError) {
        responder(`He añadido **${prod.nombre}** al carrito. Ahora tienes **${ultimoCarrito.unidades} ${ultimoCarrito.unidades === 1 ? 'unidad' : 'unidades'}** (${ultimoCarrito.total} €).`);
      }
      return;
    }
    if (!prod) {
      responder('No he identificado qué producto quieres añadir. Prueba con el nombre de uno del catálogo, por ejemplo: «añade el altavoz» o «añade el teclado».');
      return;
    }
  }

  // 3. Búsqueda de productos
  if (!buscar) {
    responder('El servidor no tiene registrada la herramienta `buscar_productos`.');
    return;
  }

  const argumentos = extraerFiltros(texto);
  const { resultado } = await ejecutarLlamadaEnChat(buscar, argumentos);
  if (!resultado.isError) {
    const count = resultado.structuredContent?.productos?.length;
    if (count === 0) {
      responder('No he encontrado productos con esos filtros. Prueba con otra palabra o categoría (`audio`, `escritorio`, `viaje`, `hogar`).');
    } else if (typeof count === 'number') {
      responder(`He encontrado **${count} ${count === 1 ? 'producto' : 'productos'}**. Puedes añadir cualquiera al carrito directamente desde la vista.`);
    } else {
      responder('He ejecutado `buscar_productos` (aún falta `structuredContent` para mostrar las tarjetas).');
    }
  }
}

/* ───────────── Bucle principal de conversación ───────────── */

function bloquearChat(ocupado) {
  chat.ocupado = ocupado;
  $pregunta.elements.texto.disabled = ocupado;
  $('#enviar').disabled = ocupado;
  $nuevaChat.disabled = ocupado;
  for (const $btn of $sugerencias.querySelectorAll('button')) $btn.disabled = ocupado;
  $pensando.hidden = !ocupado;
}

async function conversar(texto) {
  bloquearChat(true);
  añadirAlChat(h('p', { className: 'burbuja usuario' }, texto));
  chat.historial.push({ role: 'user', content: texto });

  try {
    const token = obtenerToken();
    const tools = diagnostico.tools;

    if (!token) {
      await responderEnLocal(texto, tools);
      return;
    }

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const output = await llamarAlModelo(tools, token);

      const respuesta = textoDelModelo(output);
      if (respuesta) {
        chat.historial.push({ role: 'assistant', content: respuesta });
        pintarRespuestaAsistente(respuesta);
      }

      const llamadas = output.filter((item) => item.type === 'function_call');
      if (llamadas.length === 0) break;

      for (const llamada of llamadas) {
        const herramienta = tools.find((t) => t.name === llamada.name);
        let argumentos = {};
        try {
          argumentos = JSON.parse(llamada.arguments || '{}');
        } catch {}

        if (!herramienta) {
          chat.historial.push({ type: 'function_call', call_id: llamada.call_id, name: llamada.name, arguments: llamada.arguments || '{}' });
          chat.historial.push({ type: 'function_call_output', call_id: llamada.call_id, output: `No existe la herramienta "${llamada.name}".` });
          continue;
        }
        await ejecutarLlamadaEnChat(herramienta, argumentos, llamada.call_id);
      }
    }
  } catch (error) {
    const $aviso = h('div', { className: 'aviso' }, `✕ ${error.message}`);
    if (error.status === 401) {
      $aviso.append(
        h(
          'div',
          { className: 'aviso-acciones' },
          h('button', { type: 'button', onclick: pedirToken }, 'Cambiar token del taller'),
        ),
      );
    }
    añadirAlChat($aviso);
  } finally {
    bloquearChat(false);
    $pregunta.elements.texto.focus();
  }
}

let cola = Promise.resolve();
function enviarAlChat(texto) {
  cola = cola.then(() => conversar(texto));
  return cola;
}

$pregunta.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const texto = $pregunta.elements.texto.value.trim();
  if (!texto || chat.ocupado) return;
  $pregunta.reset();
  enviarAlChat(texto);
});

for (const $chip of $sugerencias.querySelectorAll('button[data-prompt]')) {
  $chip.addEventListener('click', () => {
    if (chat.ocupado) return;
    enviarAlChat($chip.dataset.prompt);
  });
}

$ponerToken.addEventListener('click', pedirToken);

$nuevaChat.addEventListener('click', () => {
  if (chat.ocupado) return;
  chat.vistas.abort();
  chat.vistas = new AbortController();
  chat.historial = [];
  chat.contexto = '';
  $chat.replaceChildren(
    h(
      'div',
      { className: 'burbuja asistente' },
      h('p', { className: 'quien' }, '◆ modelo'),
      h('p', {}, 'Conversación reiniciada. Escribe lo que quieras probar con tus herramientas MCP.'),
    ),
  );
  $pregunta.elements.texto.focus();
});

try {
  window.parent.addEventListener('taller:token-change', sincronizarModoChat);
} catch {}
window.addEventListener('storage', (evento) => {
  if (evento.key === 'taller:token') sincronizarModoChat();
});

/* ───────────── Arranque ───────────── */

// Para las comprobaciones de los pasos
window.__mcp = mcp;
window.__eventos = eventos;

sincronizarModoChat();

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
diagnostico.tools = tools;
$('#herramientas').replaceChildren(...tools.map(pintarHerramienta));

// Diagnóstico inicial del recurso ui:// (incluso si falta TODO 1, para marcar TODO 3 si ya está hecho)
diagnostico.recursoCatalogo = await leerVista(URI_CATALOGO);

// Turno inicial de demostración (sin consumir API y necesario para las comprobaciones de los pasos 4 y 5)
const buscar = tools.find((tool) => tool.name === 'buscar_productos');
const argumentosIniciales = { categoria: 'audio' };
const $respuestaInicial = h('div');
añadirAlChat(h('p', { className: 'burbuja usuario' }, 'busca algo de audio'));
añadirAlChat(
  h(
    'div',
    { className: 'burbuja llamada' },
    h('p', { className: 'quien' }, '◆ modelo'),
    h('code', {}, `buscar_productos(${JSON.stringify(argumentosIniciales)})`),
    $respuestaInicial,
  ),
);

if (buscar) {
  const { resultado, recurso } = await probar(buscar, argumentosIniciales, $respuestaInicial, {
    alContexto: (texto) => (chat.contexto = texto),
    alMensaje: enviarAlChat,
    signal: chat.vistas.signal,
  });
  diagnostico.buscarResultado = resultado;
  if (recurso) diagnostico.recursoCatalogo = recurso;

  chat.historial.push(
    { role: 'user', content: 'busca algo de audio' },
    { type: 'function_call', call_id: 'call_inicial', name: 'buscar_productos', arguments: JSON.stringify(argumentosIniciales) },
    { type: 'function_call_output', call_id: 'call_inicial', output: textoDe(resultado) || '(sin texto)' },
    { role: 'assistant', content: 'Aquí tienes los productos de audio disponibles.' },
  );
} else {
  $respuestaInicial.append(h('p', { className: 'aviso' }, 'El servidor no tiene la herramienta buscar_productos.'));
}

actualizarResumenHerramientas();
