// Los archivos del editor de cada reto, leídos al compilar. Para el reto <slug>:
//   retos/<slug>/editor/<ruta>            el archivo (si no está, se busca en retos/tienda/)
//   retos/<slug>/editor/comprobaciones.js los pasos, sus pistas y cómo se comprueba cada uno
// Un archivo es editable si tiene huecos: lo único que se puede tocar en el editor. Cada hueco lleva
// lo que se ve al empezar y la solución; en el editor solo se escribe dentro de cada ___ (lo de alrededor
// tiene que ser igual en la solución):
//   //[hueco TODO 1]
//   const modelContext = ___;
//   //[solución]
//   const modelContext = document.modelContext;
//   //[/hueco]
// La lista de archivos, la entrada y el resto de opciones están en el frontmatter del README (editor:).
import type { Comprobaciones, ConfigDelEditor, HuecoDelArchivo } from '../lib/retos/tipos';

export interface EditorFrontmatter {
  entrada: string;
  archivos: string[];
  ocultos?: string[];
  preludios?: string[];
  paneles?: string[];
  generados?: ConfigDelEditor['generados'];
}

const crudos = import.meta.glob<string>(['/retos/*/editor/**/*.{js,html,css}', '/retos/tienda/*.{js,html,css}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const comprobaciones = import.meta.glob<{ default: Comprobaciones }>('/retos/*/editor/comprobaciones.js', { eager: true });

// El token del taller se inyecta en el navegador desde localStorage (src/lib/retos/editor.ts)

const INICIO_HUECO = /^\s*\/\/\s*\[hueco (TODO \d+)\]\s*$/;
const SOLUCION_HUECO = /^\s*\/\/\s*\[solución\]\s*$/;
const FIN_HUECO = /^\s*\/\/\s*\[\/hueco\]\s*$/;

/**
 * Lo que va en cada ___ de `inicio`, sacado de la solución: el texto de alrededor tiene que ser el mismo.
 * null si la solución no encaja en el molde.
 */
function rellenosDe(inicio: string, solucion: string) {
  const fijos = inicio.split('___');
  if (fijos.length < 2) return null;
  const primero = fijos[0];
  const ultimo = fijos.at(-1)!;
  if (!solucion.startsWith(primero) || !solucion.endsWith(ultimo) || solucion.length < primero.length + ultimo.length) return null;
  const centro = solucion.slice(primero.length, solucion.length - ultimo.length);
  const rellenos: string[] = [];
  let desde = 0;
  for (const fijo of fijos.slice(1, -1)) {
    const donde = centro.indexOf(fijo, desde);
    if (donde < 0) return null;
    rellenos.push(centro.slice(desde, donde));
    desde = donde + fijo.length;
  }
  rellenos.push(centro.slice(desde));
  return { fijos, rellenos };
}

/**
 * Separa el texto fijo de los huecos. Cada ___ es un hueco (lo de alrededor no se toca) y lo que va en él
 * sale de la solución. Si la solución no encaja en el molde, el hueco son las líneas enteras.
 */
export function partirEnHuecos(texto: string, donde: string) {
  const lineas = texto.split('\n');
  const trozos = [''];
  const huecos: HuecoDelArchivo[] = [];
  const fijo = (texto: string) => (trozos[trozos.length - 1] += texto);
  const hueco = (nuevo: HuecoDelArchivo) => (huecos.push(nuevo), trozos.push(''));

  for (let i = 0; i < lineas.length; i++) {
    if (i > 0) fijo('\n');
    const marca = lineas[i].match(INICIO_HUECO);
    if (!marca) {
      fijo(lineas[i]);
      continue;
    }
    const todo = marca[1];
    const inicio: string[] = [];
    const solucion: string[] = [];
    let destino: string[] | null = inicio;
    for (i++; i < lineas.length && !FIN_HUECO.test(lineas[i]); i++) {
      if (SOLUCION_HUECO.test(lineas[i])) destino = solucion;
      else destino.push(lineas[i]);
    }
    if (i >= lineas.length) throw new Error(`[editor] ${donde}: al hueco del ${todo} le falta su //[/hueco]`);
    if (!solucion.length) throw new Error(`[editor] ${donde}: al hueco del ${todo} le falta su //[solución]`);

    const molde = rellenosDe(inicio.join('\n'), solucion.join('\n'));
    if (!molde) {
      console.warn(`[editor] ${donde}: la solución del ${todo} no encaja en sus ___; se edita la línea entera`);
      hueco({ todo, inicio: inicio.join('\n'), solucion: solucion.join('\n') });
      continue;
    }
    molde.fijos.forEach((texto, k) => {
      fijo(texto);
      if (k < molde.rellenos.length) hueco({ todo, inicio: '___', solucion: molde.rellenos[k] });
    });
  }
  return { trozos, huecos };
}

/** trozos[0] + rellenos[0] + trozos[1] + … */
const componer = (trozos: string[], rellenos: string[]) =>
  trozos.reduce((texto, trozo, i) => texto + trozo + (rellenos[i] ?? ''), '');

export function configDelEditor(slug: string, editor: EditorFrontmatter): ConfigDelEditor {
  const leer = (ruta: string) => crudos[`/retos/${slug}/editor/${ruta}`] ?? crudos[`/retos/tienda/${ruta}`];

  const rutas = [...editor.archivos, ...(editor.ocultos ?? [])];
  const archivos = rutas.map((ruta) => {
    const crudo = leer(ruta);
    if (crudo === undefined) throw new Error(`[editor] Falta retos/${slug}/editor/${ruta} (ni está en retos/tienda/)`);
    const oculto = (editor.ocultos ?? []).includes(ruta);
    const { trozos, huecos } = partirEnHuecos(crudo, `retos/${slug}/editor/${ruta}`);
    if (!huecos.length) return { ruta, contenido: trozos[0], editable: false, oculto };
    return {
      ruta,
      contenido: componer(trozos, huecos.map((hueco) => hueco.inicio)),
      solucion: componer(trozos, huecos.map((hueco) => hueco.solucion)),
      trozos,
      huecos,
      editable: true,
      oculto,
    };
  });

  return {
    slug,
    entrada: editor.entrada,
    archivos,
    preludios: editor.preludios ?? [],
    paneles: editor.paneles ?? [],
    generados: editor.generados ?? [],
  };
}

/** Título, archivo, TODO y pistas de cada paso, para pintarlos sin esperar al JavaScript */
export function pasosDelReto(slug: string) {
  return (comprobaciones[`/retos/${slug}/editor/comprobaciones.js`]?.default.pasos ?? []).map(
    ({ titulo, archivo, todo, pistas = [] }) => ({ titulo, archivo, todo, pistas }),
  );
}
