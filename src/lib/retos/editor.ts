// El editor de los retos: pestañas con los archivos, CodeMirror, el resultado en un iframe, la consola
// y los pasos, que se comprueban solos cada vez que ejecutas. En los archivos editables solo se escribe
// en sus huecos (huecos.ts); lo que escribes en ellos se guarda en localStorage.
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { indentWithTab } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { montarAgente } from './agente';
import { comprobar, type Estado } from './comprobar';
import { ejecutar, traducir, type Ejecucion } from './ejecutar';
import { componer, contenidoDeHuecos, huecos, huecosDe, marcarHechos } from './huecos';
import { CARPETA_VENDOR } from './paquetes.js';
import { resaltado, tema, todos } from './tema';
import type { ArchivoDelReto, Comprobaciones, ConfigDelEditor } from './tipos';
import { getToken, TOKEN_CHANGE_EVENT } from '../token';

const comprobacionesDe = import.meta.glob<{ default: Comprobaciones }>('/retos/*/editor/comprobaciones.js');

const lenguaje = (ruta: string) => (ruta.endsWith('.html') ? html() : ruta.endsWith('.css') ? css() : javascript());

/** Huella del texto fijo de un archivo: si cambia el enunciado, lo que tenías guardado deja de valer */
function huella(texto: string) {
  let hash = 5381;
  for (let i = 0; i < texto.length; i++) hash = ((hash << 5) + hash + texto.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

function h<K extends keyof HTMLElementTagNameMap>(etiqueta: K, propiedades: Record<string, unknown> = {}, ...hijos: (Node | string | null | false | undefined)[]) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...(hijos.filter((hijo) => hijo != null && hijo !== false) as (Node | string)[]));
  return $elemento;
}

const CANDADO =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';

const iguales = (a: string[], b: string[]) => a.length === b.length && a.every((valor, i) => valor === b[i]);

export async function montarEditor($raiz: HTMLElement) {
  const config: ConfigDelEditor = JSON.parse($raiz.querySelector('[data-config]')!.textContent!);
  const { slug } = config;
  const $ = <T extends Element = HTMLElement>(selector: string) => $raiz.querySelector<T>(selector)!;

  const $pestanas = $('[data-pestanas]');
  const $cuerpo = $('[data-cuerpo]');
  const $divisor = $('[data-divisor]');
  const $codigo = $('[data-codigo]');
  const $aviso = $('[data-aviso-solucion]');
  const $avisoLectura = $('[data-aviso-lectura]');
  const $avisoBloqueo = $('[data-aviso-bloqueo]');
  const $vista = $('[data-vista]');
  const $consola = $('[data-consola]');
  const $contadorConsola = $('[data-contador-consola]');
  const $error = $('[data-error]');
  const $pruebas = $('[data-pruebas]');
  const $progreso = $('[data-progreso]');
  const $ejecutar = $<HTMLButtonElement>('[data-accion="ejecutar"]');
  const $solucion = $<HTMLButtonElement>('[data-accion="solucion"]');
  const $reiniciar = $<HTMLButtonElement>('[data-accion="reiniciar"]');
  const $ampliar = $<HTMLButtonElement>('[data-accion="ampliar"]');
  const $pasos = [...$raiz.querySelectorAll<HTMLElement>('[data-paso]')];

  // ── Archivos: el original, tu versión (guardada) y la solución ──────────

  const clave = (ruta: string) => `reto:${slug}:${ruta}`;
  const CLAVE_EJECUTANDO = `reto:${slug}:ejecutando`;
  const CLAVE_COMPLETADO = `reto:${slug}:completado`;

  // config.js apunta a esta misma web: en local, localhost; en el despliegue, el dominio del taller.
  // El token del taller se rellena desde localStorage cada vez que se muestra o ejecuta.
  const conUrl = (texto: string) => texto.replaceAll('__URL_DEL_TALLER__', location.origin);
  const conToken = (texto: string) => texto.replaceAll('__TOKEN_DEL_TALLER__', getToken());
  const archivos: ArchivoDelReto[] = config.archivos.map((archivo) => ({
    ...archivo,
    contenido: conUrl(archivo.contenido),
    solucion: archivo.solucion && conUrl(archivo.solucion),
    trozos: archivo.trozos?.map(conUrl),
    huecos: archivo.huecos?.map((hueco) => ({ ...hueco, inicio: conUrl(hueco.inicio), solucion: conUrl(hueco.solucion) })),
  }));
  const archivo = (ruta: string) => archivos.find((a) => a.ruta === ruta)!;
  const iniciales = (a: ArchivoDelReto) => a.huecos!.map((hueco) => hueco.inicio);
  const soluciones = (a: ArchivoDelReto) => a.huecos!.map((hueco) => hueco.solucion);
  const huellaDe = (a: ArchivoDelReto) => huella(a.trozos!.join('\u0000'));

  /** Lo que has escrito en los huecos de cada archivo editable */
  const tuyo = new Map<string, string[]>();
  for (const a of archivos.filter((a) => a.editable)) {
    let rellenos = iniciales(a);
    try {
      const guardado = JSON.parse(localStorage.getItem(clave(a.ruta)) ?? 'null');
      if (guardado?.base === huellaDe(a) && guardado.huecos?.length === rellenos.length) rellenos = guardado.huecos;
    } catch {}
    tuyo.set(a.ruta, rellenos);
  }

  const guardar = (ruta: string, rellenos: string[]) => {
    const a = archivo(ruta);
    if (iguales(rellenos, iniciales(a))) localStorage.removeItem(clave(ruta));
    else localStorage.setItem(clave(ruta), JSON.stringify({ base: huellaDe(a), huecos: rellenos }));
  };

  /** El archivo con tus huecos o con los de la solución, y dónde queda cada hueco */
  const componerArchivo = (a: ArchivoDelReto, enSolucion: boolean) =>
    componer(a.trozos!, enSolucion ? soluciones(a) : tuyo.get(a.ruta)!, a.huecos!.map((hueco) => hueco.todo));

  /** Los TODO de los pasos que ya funcionan */
  const hechos = new Set<string>();

  let modo: 'tuyo' | 'solucion' = 'tuyo';
  // Primero los que se editan; después, los de solo lectura
  const visibles = [...archivos.filter((a) => !a.oculto && a.editable), ...archivos.filter((a) => !a.oculto && !a.editable)];
  let actual = visibles[0].ruta;

  /** Los archivos tal y como se van a ejecutar */
  function archivosAEjecutar(enModo = modo) {
    const resultado = new Map<string, string>();
    for (const a of archivos) resultado.set(a.ruta, conToken(a.editable ? componerArchivo(a, enModo === 'solucion').texto : a.contenido));
    for (const generado of config.generados) {
      if (generado.tipo === 'vista-mcp-app') resultado.set(generado.ruta, vistaEmpaquetada(resultado, generado.carpeta));
    }
    return resultado;
  }

  // Reto 1: la vista de MCP Apps viaja en un único HTML (en tu máquina lo hace lib/vista.js con esbuild)
  function vistaEmpaquetada(archivos: Map<string, string>, carpeta: string) {
    const escapar = (codigo: string) => codigo.replaceAll('</script', '<\\/script');
    const importMap = { imports: { '@modelcontextprotocol/ext-apps': new URL(`${CARPETA_VENDOR}/ext-apps.js`, location.origin).href } };
    const documento = (archivos.get(`${carpeta}/index.html`) ?? '')
      .replace('<!-- ESTILOS -->', () => `<style>${archivos.get(`${carpeta}/estilos.css`) ?? ''}</style>`)
      .replace(
        '<!-- SCRIPT -->',
        () =>
          // ___ son los huecos sin rellenar: valen undefined
          `<script>globalThis.___ = undefined</script>\n<script type="importmap">${JSON.stringify(importMap)}</script>\n<script type="module">${escapar(archivos.get(`${carpeta}/app.js`) ?? '')}</script>`,
      );
    return `// Generado por el editor: la carpeta ${carpeta}/ empaquetada en un único HTML\nexport async function crearVista() {\n  return ${JSON.stringify(documento)};\n}\n`;
  }

  // ── CodeMirror ──────────────────────────────────────────────────────────

  const soloLectura = new Compartment();
  const estados = new Map<string, EditorState>();
  let guardarTrasEscribir = 0;

  const atajos = keymap.of([
    indentWithTab,
    { key: 'Mod-s', preventDefault: true, run: () => (ejecutarTodo(), true) },
    { key: 'Mod-Enter', preventDefault: true, run: () => (ejecutarTodo(), true) },
  ]);

  // Si intentas escribir fuera de un hueco, un aviso te recuerda dónde se escribe
  let ocultarBloqueo = 0;
  const avisarBloqueo = () => {
    $avisoBloqueo.hidden = false;
    clearTimeout(ocultarBloqueo);
    ocultarBloqueo = window.setTimeout(() => ($avisoBloqueo.hidden = true), 2500);
  };

  function crearEstado(ruta: string, enSolucion: boolean) {
    const a = archivo(ruta);
    const comunes = [
      basicSetup,
      // Las pistas de los TODO son comentarios largos: mejor leerlas sin desplazarse a los lados
      EditorView.lineWrapping,
      atajos,
      lenguaje(ruta),
      tema,
      resaltado,
      todos,
    ];
    const soloLeer = soloLectura.of([EditorState.readOnly.of(true), EditorView.editable.of(false)]);

    if (!a.editable) return EditorState.create({ doc: conToken(a.contenido), extensions: [comunes, soloLeer] });

    const { texto, huecos: posiciones } = componerArchivo(a, enSolucion);
    if (enSolucion) return EditorState.create({ doc: texto, extensions: [comunes, soloLeer, huecos(posiciones, { solucion: true })] });

    return EditorState.create({
      doc: texto,
      extensions: [
        comunes,
        huecos(posiciones, { alBloquear: avisarBloqueo }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const rellenos = contenidoDeHuecos(update.state);
          tuyo.set(ruta, rellenos);
          clearTimeout(guardarTrasEscribir);
          guardarTrasEscribir = window.setTimeout(() => guardar(ruta, rellenos), 300);
          pintarPestanas();
          $raiz.classList.add('sin-ejecutar');
          comprobarAlEscribir();
        }),
      ],
    });
  }

  const vistaEditor = new EditorView({ parent: $codigo });

  const llaveDe = (ruta: string) => `${modo === 'solucion' && archivo(ruta).editable ? 'solucion' : 'tuyo'}:${ruta}`;

  const estadoDe = (ruta: string) => {
    const llave = llaveDe(ruta);
    if (!estados.has(llave)) estados.set(llave, crearEstado(ruta, llave.startsWith('solucion:')));
    return estados.get(llave)!;
  };

  /** Cambia el estado del editor y le dice qué huecos están ya hechos */
  function mostrar(ruta: string) {
    vistaEditor.setState(estadoDe(ruta));
    vistaEditor.dispatch({ effects: marcarHechos.of([...hechos]) });
  }

  function abrir(ruta: string) {
    if ($cuerpo.dataset.plegado === 'codigo') restaurarColumnas();
    // Guarda el estado (cursor, historial) del archivo que dejamos
    estados.set(llaveDe(actual), vistaEditor.state);
    actual = ruta;
    mostrar(ruta);
    pintarPestanas();
    pintarAvisos();
  }

  // ── Pestañas de archivos ────────────────────────────────────────────────

  const todosDe = (a: ArchivoDelReto) => new Set(a.huecos!.map((hueco) => hueco.todo)).size;

  function pestana(a: ArchivoDelReto) {
    const terminado = a.editable && (modo === 'solucion' || a.huecos!.every((hueco) => hechos.has(hueco.todo)));
    const cambiado = a.editable && !iguales(tuyo.get(a.ruta)!, iniciales(a));
    const $icono = h('span', { className: 'icono-pestana', ariaHidden: 'true' }, a.editable ? (terminado ? '✓' : '✎') : '');
    if (!a.editable) $icono.innerHTML = CANDADO;
    const $boton = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        className: [a.editable ? 'editable' : 'lectura', terminado && 'terminado'].filter(Boolean).join(' '),
        title: a.editable
          ? `Tienes que completar ${todosDe(a) === 1 ? 'su TODO' : `sus ${todosDe(a)} TODO`}`
          : 'Solo lectura: está para que veas el contexto',
        onclick: () => abrir(a.ruta),
      },
      $icono,
      a.ruta,
      cambiado && h('span', { className: 'cambiado', title: 'Has escrito en este archivo' }, '•'),
    );
    $boton.setAttribute('aria-selected', String(a.ruta === actual));
    return $boton;
  }

  function pintarPestanas() {
    $pestanas.replaceChildren(...visibles.map(pestana));
  }

  function pintarAvisos() {
    const a = archivo(actual);
    $aviso.hidden = modo !== 'solucion';
    $aviso.querySelector<HTMLButtonElement>('[data-accion="copiar"]')!.hidden = !a.editable;
    $avisoLectura.hidden = modo === 'solucion' || a.editable;
    $solucion.setAttribute('aria-pressed', String(modo === 'solucion'));
    $solucion.textContent = modo === 'solucion' ? 'Volver a tu código' : 'Ver solución';
    $raiz.classList.toggle('en-solucion', modo === 'solucion');
    $raiz.classList.toggle('en-lectura', !a.editable);
  }

  // En el aviso de solo lectura, un botón a cada archivo que sí se edita
  $avisoLectura.querySelector('[data-editables]')!.replaceChildren(
    ...visibles
      .filter((a) => a.editable)
      .flatMap((a, i) => [i > 0 ? ' y ' : '', h('button', { type: 'button', className: 'enlace', onclick: () => abrir(a.ruta) }, a.ruta)]),
  );

  // ── Consola ─────────────────────────────────────────────────────────────

  let errores = 0;
  let ejecucion: Ejecucion | null = null;

  /** Los «archivo.js:12:5» de la consola llevan a esa línea */
  function enlazar(texto: string) {
    const rutas = archivos.map((a) => a.ruta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const patron = new RegExp(`(${rutas}):(\\d+)(?::(\\d+))?`, 'g');
    const partes: (string | Node)[] = [];
    let ultimo = 0;
    for (const coincidencia of texto.matchAll(patron)) {
      const [todo, ruta, linea] = coincidencia;
      partes.push(texto.slice(ultimo, coincidencia.index));
      const visible = visibles.some((a) => a.ruta === ruta);
      partes.push(
        visible
          ? h('button', { type: 'button', className: 'enlace', onclick: () => irALinea(ruta, Number(linea)) }, todo)
          : todo,
      );
      ultimo = coincidencia.index! + todo.length;
    }
    partes.push(texto.slice(ultimo));
    return partes;
  }

  function anotar(nivel: string, texto: string) {
    const traducido = ejecucion ? traducir(texto, ejecucion.rutas) : texto;
    $consola.querySelector('.vacia')?.remove();
    $consola.append(h('li', { className: nivel }, ...enlazar(traducido)));
    $consola.scrollTop = $consola.scrollHeight;
    if (nivel === 'error') {
      errores++;
      $contadorConsola.textContent = String(errores);
      $contadorConsola.hidden = false;
      // En la franja: la primera línea del error y el primer sitio de tu código donde ha pasado
      const [primera, ...resto] = traducido.split('\n');
      const rutas = archivos.map((a) => a.ruta);
      const donde = resto.join('\n').match(/([\w./-]+\.js):(\d+)(?::(\d+))?/g)?.find((sitio) => rutas.includes(sitio.split(':')[0]));
      $error.replaceChildren(h('span', {}, '✕ '), ...enlazar(primera), ...(donde && !primera.includes(donde) ? [' · ', ...enlazar(donde)] : []));
      $error.hidden = false;
    }
  }

  function limpiarConsola() {
    errores = 0;
    $contadorConsola.hidden = true;
    $error.hidden = true;
    $consola.replaceChildren(h('li', { className: 'vacia' }, 'Aquí salen los console.log y los errores de tu código.'));
  }

  function irALinea(ruta: string, linea: number) {
    if ($cuerpo.dataset.plegado === 'codigo') restaurarColumnas();
    if (ruta !== actual) abrir(ruta);
    const documento = vistaEditor.state.doc;
    const { from } = documento.line(Math.min(Math.max(linea, 1), documento.lines));
    vistaEditor.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    vistaEditor.focus();
  }

  /** Lleva al hueco de un TODO y selecciona su primer ___, para que al escribir lo sustituyas */
  function irATodo(ruta: string, todo: string) {
    if ($cuerpo.dataset.plegado === 'codigo') restaurarColumnas();
    if (ruta !== actual) abrir(ruta);
    const { state } = vistaEditor;
    const hueco = huecosDe(state).find((h) => h.todo === todo);
    if (!hueco) {
      const posicion = state.doc.toString().search(new RegExp(`${todo}\\b`));
      if (posicion >= 0) irALinea(ruta, state.doc.lineAt(posicion).number);
      return;
    }
    const blanco = state.sliceDoc(hueco.from, hueco.to).indexOf('___');
    vistaEditor.dispatch({
      selection: blanco >= 0 ? { anchor: hueco.from + blanco, head: hueco.from + blanco + 3 } : { anchor: hueco.to },
      effects: EditorView.scrollIntoView(hueco.from, { y: 'center' }),
    });
    vistaEditor.focus();
  }

  /** Rellena los huecos de un TODO con la solución */
  function rellenar(ruta: string, todo: string) {
    if (modo === 'solucion') cambiarModo('tuyo', false);
    if (ruta !== actual) abrir(ruta);
    const a = archivo(ruta);
    const cambios = huecosDe(vistaEditor.state).flatMap((hueco, i) =>
      hueco.todo === todo ? [{ from: hueco.from, to: hueco.to, insert: a.huecos![i].solucion }] : [],
    );
    vistaEditor.dispatch({ changes: cambios, userEvent: 'input.rellenar' });
    irATodo(ruta, todo);
    ejecutarTodo();
  }

  // ── Agente (reto de WebMCP) ─────────────────────────────────────────────

  const $agente = $raiz.querySelector<HTMLElement>('[data-agente]');
  const agente = $agente && config.paneles.includes('agente') ? montarAgente($agente) : null;

  window.addEventListener('message', ({ data, source }) => {
    if (!ejecucion || data?.__reto !== ejecucion.id || source !== ejecucion.iframe.contentWindow) return;
    if (data.tipo === 'consola') anotar(data.nivel, data.texto);
    else if (data.tipo === 'error') anotar('error', data.texto);
    else if (data.tipo === 'herramientas') agente?.actualizar();
    else if (data.tipo === 'cargada') localStorage.removeItem(CLAVE_EJECUTANDO);
  });

  // ── Pasos: se comprueban en un iframe oculto cada vez que ejecutas ───────

  let comprobaciones: Comprobaciones | null = null;
  const cargarComprobaciones = comprobacionesDe[`/retos/${slug}/editor/comprobaciones.js`]?.().then((m) => (comprobaciones = m.default));
  let turno = 0;

  /** ¿Quedan ___ en el hueco de este TODO? */
  function quedanBlancos(ruta: string, todo: string) {
    const a = archivo(ruta);
    if (!a?.editable) return false;
    const rellenos = tuyo.get(ruta)!;
    return a.huecos!.some((hueco, i) => hueco.todo === todo && rellenos[i].includes('___'));
  }

  /** El mensaje de un paso que falla, sin errores crípticos si es que aún no lo has empezado */
  function mensajeDe($paso: HTMLElement, indice: number, mensaje: string) {
    const { archivo: ruta, todo } = $paso.dataset as { archivo: string; todo: string };
    if (quedanBlancos(ruta, todo)) return `Rellena los ___ de su hueco (${todo}, en ${ruta}).`;
    const errorDeJs = /Cannot (read|destructure)|is not (a function|defined|iterable)|of undefined|of null/.test(mensaje);
    const anteriorPendiente = $pasos.slice(0, indice).some(($p) => $p.dataset.estado === 'falla');
    return errorDeJs && anteriorPendiente ? `${mensaje}\n¿Te falta algún paso anterior? Este depende de ellos.` : mensaje;
  }

  function pintarPaso(indice: number, estado: Estado | 'comprobando') {
    const $paso = $pasos[indice];
    if (!$paso) return;
    if (estado === 'comprobando') {
      $paso.dataset.comprobando = '';
      return;
    }
    delete $paso.dataset.comprobando;
    $paso.dataset.estado = estado.ok ? 'ok' : 'falla';
    $paso.querySelector('.mensaje')!.textContent = estado.ok ? '' : mensajeDe($paso, indice, estado.mensaje);
    // El hueco de un paso hecho se pinta en verde
    if (estado.ok) hechos.add($paso.dataset.todo!);
    else hechos.delete($paso.dataset.todo!);
    vistaEditor.dispatch({ effects: marcarHechos.of([...hechos]) });
    pintarPestanas();
  }

  function pintarProgreso() {
    const enSolucion = modo === 'solucion';
    const listos = enSolucion ? $pasos.length : $pasos.filter(($paso) => $paso.dataset.estado === 'ok').length;
    $progreso.textContent = `${listos}/${$pasos.length}`;
    const completado = listos === $pasos.length && $pasos.length > 0;
    $raiz.classList.toggle('completado', completado);
    if (completado && !enSolucion) localStorage.setItem(CLAVE_COMPLETADO, '1');
  }

  /**
   * Comprueba los pasos con tu código. Al escribir (`alEscribir`) no hay ruedas girando ni mensajes nuevos:
   * un paso solo cambia si pasa a estar bien o si deja de estarlo.
   */
  async function lanzarComprobaciones(archivosEjecutados: Map<string, string>, { alEscribir = false } = {}) {
    await cargarComprobaciones;
    if (!comprobaciones || (alEscribir && comprobaciones.soloAlEjecutar)) return;
    const miTurno = ++turno;
    if (!alEscribir) $pasos.forEach((_, indice) => pintarPaso(indice, 'comprobando'));
    $pruebas.replaceChildren();
    await comprobar(
      comprobaciones,
      {
        archivos: archivosEjecutados,
        entrada: config.entrada,
        preludios: config.preludios,
        contenedor: $pruebas,
        omitir: (indice) => {
          const paso = comprobaciones!.pasos[indice];
          return quedanBlancos(paso.archivo, paso.todo) ? `Rellena los ___ de su hueco (${paso.todo}, en ${paso.archivo}).` : null;
        },
      },
      (indice, estado) => {
        if (miTurno !== turno) return;
        // Si había una comprobación a mano a medias (ruedas girando), esta la sustituye: se pinta todo
        const antes = $pasos[indice]?.dataset.estado;
        const comprobando = $pasos[indice]?.hasAttribute('data-comprobando');
        if (alEscribir && !estado.ok && antes !== 'ok' && !comprobando) return;
        pintarPaso(indice, estado);
        pintarProgreso();
      },
      () => miTurno !== turno,
    );
  }

  // Mientras escribes, los pasos se comprueban solos tras una pausa: sin tocar lo que ves en «Resultado»
  let comprobarTrasEscribir = 0;
  function comprobarAlEscribir() {
    clearTimeout(comprobarTrasEscribir);
    comprobarTrasEscribir = window.setTimeout(() => {
      if (modo === 'tuyo') lanzarComprobaciones(archivosAEjecutar(), { alEscribir: true });
    }, 700);
  }

  function reiniciarPistas($paso: HTMLElement) {
    const $pistas = [...$paso.querySelectorAll<HTMLElement>('[data-pistas] > li')];
    const $pista = $paso.querySelector<HTMLButtonElement>('[data-pista]')!;
    const $rellenar = $paso.querySelector<HTMLButtonElement>('[data-rellenar]')!;
    for (const $p of $pistas) $p.hidden = true;
    $pista.textContent = 'Pista';
    $pista.hidden = $pistas.length === 0;
    $rellenar.hidden = $pistas.length > 0;
  }

  for (const $paso of $pasos) {
    const { archivo: ruta, todo } = $paso.dataset as { archivo: string; todo: string };
    $paso.querySelector('[data-ir]')!.addEventListener('click', () => {
      if (modo === 'solucion') cambiarModo('tuyo');
      irATodo(ruta, todo);
    });

    // Las pistas salen de una en una; después de la última, se puede rellenar el hueco con la solución
    const $pistas = [...$paso.querySelectorAll<HTMLElement>('[data-pistas] > li')];
    const $pista = $paso.querySelector<HTMLButtonElement>('[data-pista]')!;
    const $rellenar = $paso.querySelector<HTMLButtonElement>('[data-rellenar]')!;
    reiniciarPistas($paso);
    $pista.addEventListener('click', () => {
      const vistas = $pistas.filter(($p) => !$p.hidden).length;
      if (vistas < $pistas.length) $pistas[vistas].hidden = false;
      const quedan = $pistas.length - vistas - 1;
      $pista.textContent = `Otra pista (${vistas + 2}/${$pistas.length})`;
      $pista.hidden = quedan <= 0;
      $rellenar.hidden = quedan > 0;
    });
    $rellenar.addEventListener('click', () => rellenar(ruta, todo));
  }

  // ── Ejecutar ────────────────────────────────────────────────────────────

  function ejecutarTodo() {
    clearTimeout(comprobarTrasEscribir);
    ejecucion?.cerrar();
    limpiarConsola();
    $raiz.classList.remove('sin-ejecutar');

    const enEjecucion = archivosAEjecutar();
    // Si tu código se cuelga (un bucle infinito), al recargar no se vuelve a ejecutar solo
    localStorage.setItem(CLAVE_EJECUTANDO, '1');
    ejecucion = ejecutar({ archivos: enEjecucion, entrada: config.entrada, preludios: config.preludios, contenedor: $vista });
    agente?.conectar(ejecucion.iframe.contentWindow);
    ejecucion.cargada.then(() => {
      localStorage.removeItem(CLAVE_EJECUTANDO);
      agente?.actualizar();
    });

    if (modo === 'tuyo') lanzarComprobaciones(enEjecucion);
  }

  function cambiarModo(nuevo: typeof modo, ejecutarDespues = true) {
    estados.set(llaveDe(actual), vistaEditor.state);
    modo = nuevo;
    if (modo === 'solucion') {
      turno++;
      for (const $paso of $pasos) delete $paso.dataset.comprobando;
    }
    mostrar(actual);
    pintarAvisos();
    pintarPestanas();
    pintarProgreso();
    if (ejecutarDespues) ejecutarTodo();
  }

  $ejecutar.addEventListener('click', ejecutarTodo);
  $solucion.addEventListener('click', () => cambiarModo(modo === 'tuyo' ? 'solucion' : 'tuyo'));

  // «Copiar a mi código»: los huecos de la solución pasan a ser los tuyos
  $aviso.querySelector('[data-accion="copiar"]')!.addEventListener('click', () => {
    const a = archivo(actual);
    if (!a.editable) return;
    tuyo.set(actual, soluciones(a));
    guardar(actual, soluciones(a));
    estados.delete(`tuyo:${actual}`);
    cambiarModo('tuyo');
  });

  // Reiniciar pide un segundo clic: borra tus cambios en todos los archivos
  let confirmarReinicio = 0;
  $reiniciar.addEventListener('click', () => {
    if (!confirmarReinicio) {
      $reiniciar.textContent = '¿Borrar tus cambios?';
      $reiniciar.classList.add('peligro');
      confirmarReinicio = window.setTimeout(() => {
        confirmarReinicio = 0;
        $reiniciar.textContent = 'Reiniciar';
        $reiniciar.classList.remove('peligro');
      }, 3000);
      return;
    }
    clearTimeout(confirmarReinicio);
    confirmarReinicio = 0;
    $reiniciar.textContent = 'Reiniciar';
    $reiniciar.classList.remove('peligro');
    for (const a of archivos.filter((a) => a.editable)) {
      tuyo.set(a.ruta, iniciales(a));
      localStorage.removeItem(clave(a.ruta));
    }
    localStorage.removeItem(CLAVE_COMPLETADO);
    for (const $paso of $pasos) reiniciarPistas($paso);
    estados.clear();
    modo = 'tuyo';
    mostrar(actual);
    pintarPestanas();
    pintarAvisos();
    ejecutarTodo();
  });

  // ── Redimensionar columnas (código | demo) ──────────────────────────────

  const ANCHO_PLEGADO = 38;
  const UMBRAL_PLEGAR = 100;
  const MIN_ABIERTO = 180;
  let ultimaProporcion = 51.2;

  function aplicarProporcion(porcentaje: number) {
    delete $cuerpo.dataset.plegado;
    ultimaProporcion = porcentaje;
    $cuerpo.style.setProperty('--col-codigo', `minmax(0, ${porcentaje}fr)`);
    $cuerpo.style.setProperty('--col-salida', `minmax(0, ${100 - porcentaje}fr)`);
    vistaEditor.requestMeasure();
  }

  function plegarColumna(lado: 'codigo' | 'salida') {
    $cuerpo.dataset.plegado = lado;
    if (lado === 'codigo') {
      $cuerpo.style.setProperty('--col-codigo', `${ANCHO_PLEGADO}px`);
      $cuerpo.style.setProperty('--col-salida', 'minmax(0, 1fr)');
    } else {
      $cuerpo.style.setProperty('--col-codigo', 'minmax(0, 1fr)');
      $cuerpo.style.setProperty('--col-salida', `${ANCHO_PLEGADO}px`);
    }
    vistaEditor.requestMeasure();
  }

  function restaurarColumnas(proporcion = ultimaProporcion) {
    aplicarProporcion(Math.min(82, Math.max(18, proporcion)));
  }

  function redimensionarEn(clientX: number) {
    const rect = $cuerpo.getBoundingClientRect();
    const anchoDivisor = $divisor.getBoundingClientRect().width;
    const disponible = rect.width - anchoDivisor;
    if (disponible <= 0) return;

    const x = clientX - rect.left - anchoDivisor / 2;
    if (x < UMBRAL_PLEGAR) {
      plegarColumna('codigo');
      return;
    }
    if (disponible - x < UMBRAL_PLEGAR) {
      plegarColumna('salida');
      return;
    }
    const min = Math.min(MIN_ABIERTO, disponible * 0.25);
    const anchoCodigo = Math.min(disponible - min, Math.max(min, x));
    aplicarProporcion((anchoCodigo / disponible) * 100);
  }

  $divisor.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0) return;
    evento.preventDefault();
    $divisor.setPointerCapture(evento.pointerId);
    $raiz.classList.add('redimensionando');
  });

  $divisor.addEventListener('pointermove', (evento) => {
    if (!$divisor.hasPointerCapture(evento.pointerId)) return;
    redimensionarEn(evento.clientX);
  });

  const terminarRedimension = (evento: PointerEvent) => {
    if (!$divisor.hasPointerCapture(evento.pointerId)) return;
    $divisor.releasePointerCapture(evento.pointerId);
    $raiz.classList.remove('redimensionando');
    vistaEditor.requestMeasure();
  };
  $divisor.addEventListener('pointerup', terminarRedimension);
  $divisor.addEventListener('pointercancel', terminarRedimension);

  $divisor.addEventListener('dblclick', () => restaurarColumnas(51.2));

  $divisor.addEventListener('keydown', (evento) => {
    const paso = evento.shiftKey ? 10 : 5;
    if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      if ($cuerpo.dataset.plegado === 'salida') restaurarColumnas(80);
      else if (ultimaProporcion - paso < 18) plegarColumna('codigo');
      else aplicarProporcion(ultimaProporcion - paso);
    } else if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      if ($cuerpo.dataset.plegado === 'codigo') restaurarColumnas(20);
      else if (ultimaProporcion + paso > 82) plegarColumna('salida');
      else aplicarProporcion(ultimaProporcion + paso);
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      plegarColumna('codigo');
    } else if (evento.key === 'End') {
      evento.preventDefault();
      plegarColumna('salida');
    } else if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      restaurarColumnas(51.2);
    }
  });

  for (const $boton of $raiz.querySelectorAll<HTMLButtonElement>('[data-restaurar]')) {
    $boton.addEventListener('click', () => restaurarColumnas());
  }

  // Pantalla completa dentro de la página (Esc para salir)
  const ampliar = (activo: boolean) => {
    $raiz.classList.toggle('ampliado', activo);
    document.documentElement.classList.toggle('con-editor-ampliado', activo);
    $ampliar.setAttribute('aria-pressed', String(activo));
    $ampliar.title = activo ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa';
    vistaEditor.requestMeasure();
  };
  $ampliar.addEventListener('click', () => ampliar(!$raiz.classList.contains('ampliado')));
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && $raiz.classList.contains('ampliado')) ampliar(false);
  });

  // ⌘S / Ctrl+S ejecuta también con el foco fuera del código (dentro, ya lo hace el editor)
  const enMac = /Mac|iPhone|iPad/.test(navigator.platform);
  if (!enMac) $raiz.querySelector('[data-tecla-mod]')!.textContent = 'Ctrl';
  document.addEventListener('keydown', (evento) => {
    if (evento.defaultPrevented || evento.key.toLowerCase() !== 's') return;
    if (!(enMac ? evento.metaKey : evento.ctrlKey) || evento.altKey || evento.shiftKey) return;
    evento.preventDefault();
    ejecutarTodo();
  });

  // Pestañas del resultado: Resultado / Consola
  for (const $boton of $raiz.querySelectorAll<HTMLButtonElement>('[data-salida]')) {
    $boton.addEventListener('click', () => {
      for (const $otro of $raiz.querySelectorAll<HTMLButtonElement>('[data-salida]')) {
        $otro.setAttribute('aria-selected', String($otro === $boton));
        $raiz.querySelector<HTMLElement>(`[data-panel="${$otro.dataset.salida}"]`)!.hidden = $otro !== $boton;
      }
    });
  }
  $error.addEventListener('click', (evento) => {
    if ((evento.target as HTMLElement).closest('.enlace')) return;
    $raiz.querySelector<HTMLButtonElement>('[data-salida="consola"]')!.click();
  });

  // ── Arranque ────────────────────────────────────────────────────────────

  mostrar(actual);
  pintarPestanas();
  pintarAvisos();
  limpiarConsola();
  $raiz.classList.add('listo');

  // Si este reto usa el token del taller, actualiza config.js y vuelve a ejecutar en cuanto se guarde
  const usaToken = archivos.some((a) => a.contenido.includes('__TOKEN_DEL_TALLER__'));
  if (usaToken) {
    window.addEventListener(TOKEN_CHANGE_EVENT, () => {
      for (const a of archivos) {
        if (!a.editable && a.contenido.includes('__TOKEN_DEL_TALLER__')) {
          estados.delete(`tuyo:${a.ruta}`);
          estados.delete(`solucion:${a.ruta}`);
        }
      }
      if (!archivo(actual).editable && archivo(actual).contenido.includes('__TOKEN_DEL_TALLER__')) {
        mostrar(actual);
      }
      ejecutarTodo();
    });
  }

  if (localStorage.getItem(CLAVE_EJECUTANDO)) {
    localStorage.removeItem(CLAVE_EJECUTANDO);
    $raiz.classList.add('sin-ejecutar');
    anotar(
      'warn',
      'La última vez tu código no llegó a terminar de cargar (¿un bucle infinito?). Revísalo y pulsa «Ejecutar».',
    );
  } else {
    ejecutarTodo();
  }
}
