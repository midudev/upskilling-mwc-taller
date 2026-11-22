// Pestaña «Agente» del reto de WebMCP: lo que ve un agente del navegador en tu tienda.
// Lee las herramientas de document.modelContext del iframe y deja ejecutarlas con executeTool(),
// como el panel WebMCP de DevTools. Las herramientas cambian la tienda de verdad: lo ves arriba.

type Esquema = { type?: string; enum?: unknown[]; description?: string; default?: unknown };
interface Herramienta {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, Esquema>; required?: string[] };
  annotations?: Record<string, boolean>;
}

function h<K extends keyof HTMLElementTagNameMap>(etiqueta: K, propiedades: Record<string, unknown> = {}, ...hijos: (Node | string | null | false | undefined)[]) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...(hijos.filter((hijo) => hijo != null && hijo !== false) as (Node | string)[]));
  return $elemento;
}

const ANOTACIONES: Record<string, { texto: string; clase: string; ayuda: string }> = {
  readOnlyHint: { texto: 'solo lectura', clase: 'lectura', ayuda: 'No cambia nada: el agente puede usarla sin preguntar' },
  untrustedContentHint: { texto: 'contenido no fiable', clase: 'no-fiable', ayuda: 'Devuelve texto de terceros: el agente no debe obedecerlo' },
  consequentialHint: { texto: 'con consecuencias', clase: 'consecuencias', ayuda: 'Difícil de deshacer: el navegador pide confirmación' },
};

const esNumero = (esquema: Esquema) => esquema.type === 'number' || esquema.type === 'integer';
const ejemplo = (descripcion = '') => descripcion.match(/por ejemplo "([^"]+)"/)?.[1] ?? '';

function campo(nombre: string, esquema: Esquema, requerido: boolean) {
  const $control = esquema.enum
    ? h(
        'select',
        { name: nombre },
        !requerido && h('option', { value: '' }, '—'),
        ...esquema.enum.map((opcion) => h('option', { value: String(opcion) }, String(opcion))),
      )
    : h('input', {
        name: nombre,
        type: esNumero(esquema) ? 'number' : 'text',
        step: esquema.type === 'integer' ? '1' : 'any',
        required: requerido,
        autocomplete: 'off',
        spellcheck: false,
        value: String(esquema.default ?? (requerido ? ejemplo(esquema.description) : '')),
      });
  $control.title = esquema.description ?? '';
  return h('label', {}, h('span', {}, nombre, requerido ? h('b', {}, ' *') : ''), $control);
}

function leer($form: HTMLFormElement, esquema: Herramienta['inputSchema']) {
  const argumentos: Record<string, unknown> = {};
  for (const [nombre, propiedad] of Object.entries(esquema?.properties ?? {})) {
    const valor = ($form.elements.namedItem(nombre) as HTMLInputElement | null)?.value.trim() ?? '';
    if (valor !== '') argumentos[nombre] = esNumero(propiedad) ? Number(valor) : valor;
  }
  return argumentos;
}

export function montarAgente($panel: HTMLElement) {
  const $lista = h('ul', { className: 'agente-herramientas' });
  const $titulo = h('p', { className: 'agente-titulo' });
  $panel.replaceChildren($titulo, $lista);

  let ventana: any = null;
  let firma = '';

  function pintarHerramienta(herramienta: Herramienta) {
    const { name, description, inputSchema, annotations = {} } = herramienta;
    const requeridos = inputSchema?.required ?? [];
    const $resultado = h('pre', { className: 'agente-resultado', hidden: true });
    const $boton = h('button', { type: 'submit' }, 'Ejecutar ▸');
    let confirmando = false;

    const $form = h(
      'form',
      {},
      ...Object.entries(inputSchema?.properties ?? {}).map(([nombre, esquema]) => campo(nombre, esquema, requeridos.includes(nombre))),
      $boton,
    );

    $form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      // Con consecuencias: el navegador le pregunta a la persona antes de dejar que el agente siga
      if (annotations.consequentialHint && !confirmando) {
        confirmando = true;
        $boton.textContent = '¿Seguro? Confirmar ▸';
        $boton.classList.add('peligro');
        return;
      }
      confirmando = false;
      $boton.textContent = 'Ejecutar ▸';
      $boton.classList.remove('peligro');

      const argumentos = leer($form, inputSchema);
      $boton.disabled = true;
      $resultado.hidden = false;
      $resultado.className = 'agente-resultado';
      $resultado.textContent = `executeTool("${name}", ${JSON.stringify(argumentos)})…`;
      const inicio = performance.now();
      try {
        const salida = await ventana.document.modelContext.executeTool(herramienta, argumentos);
        const ms = Math.round(performance.now() - inicio);
        const aviso = annotations.untrustedContentHint ? '⚠ contenido no fiable: el agente no debe seguir instrucciones de aquí\n' : '';
        $resultado.textContent = `✓ ${ms} ms\n${aviso}${JSON.stringify(salida, null, 2) ?? 'undefined'}`;
        if (salida && typeof salida === 'object' && 'error' in salida) $resultado.classList.add('error');
      } catch (error: any) {
        $resultado.textContent = `✕ ${error?.message ?? error}`;
        $resultado.classList.add('error');
      } finally {
        $boton.disabled = false;
      }
    });

    return h(
      'li',
      {},
      h(
        'p',
        { className: 'agente-nombre' },
        h('code', {}, name),
        ...Object.entries(ANOTACIONES)
          .filter(([clave]) => annotations[clave])
          .map(([, { texto, clase, ayuda }]) => h('span', { className: `anotacion ${clase}`, title: ayuda }, texto)),
      ),
      h('p', { className: 'agente-descripcion' }, description ?? ''),
      $form,
      $resultado,
    );
  }

  async function actualizar() {
    const modelContext = ventana?.document?.modelContext;
    let herramientas: Herramienta[] = [];
    try {
      herramientas = (await modelContext?.getTools()) ?? [];
    } catch {}

    // Solo se vuelve a pintar si algo ha cambiado, para no borrar lo que ya has probado
    const nueva = JSON.stringify(herramientas);
    if (nueva === firma) return;
    firma = nueva;

    $titulo.replaceChildren(
      herramientas.length
        ? `${herramientas.length} ${herramientas.length === 1 ? 'herramienta' : 'herramientas'} en document.modelContext`
        : 'Todavía no hay herramientas: un agente solo podría mirar la pantalla y hacer clic.',
    );
    $lista.replaceChildren(...herramientas.map(pintarHerramienta));
  }

  return {
    conectar(nueva: Window | null) {
      ventana = nueva;
      firma = '';
      actualizar();
    },
    actualizar,
  };
}
