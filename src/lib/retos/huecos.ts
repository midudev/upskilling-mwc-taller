// Los huecos de un archivo editable: lo único que se puede tocar. El resto del archivo está bloqueado,
// así que no hay forma de romper el código que lo rodea. Cada ___ es un hueco: se escribe solo dentro de
// su recuadro. Las líneas de un TODO se marcan en amarillo (en verde cuando su paso está hecho).
import { EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap } from '@codemirror/view';

export interface Hueco {
  todo: string;
  from: number;
  to: number;
}

/** trozos[0] + rellenos[0] + trozos[1] + …, con dónde queda cada hueco */
export function componer(trozos: string[], rellenos: string[], todos: string[]) {
  let texto = '';
  const huecos: Hueco[] = [];
  trozos.forEach((trozo, i) => {
    texto += trozo;
    if (i >= rellenos.length) return;
    huecos.push({ todo: todos[i], from: texto.length, to: texto.length + rellenos[i].length });
    texto += rellenos[i];
  });
  return { texto, huecos };
}

/** Los TODO de los pasos que ya están hechos: sus huecos se pintan en verde */
export const marcarHechos = StateEffect.define<string[]>();

const campoHuecos = StateField.define<Hueco[]>({
  create: () => [],
  update(huecos, tr) {
    if (!tr.docChanged) return huecos;
    // Lo que se escribe justo en un borde se queda dentro del hueco
    return huecos.map((hueco) => ({ ...hueco, from: tr.changes.mapPos(hueco.from, -1), to: tr.changes.mapPos(hueco.to, 1) }));
  },
});

const campoHechos = StateField.define<Set<string>>({
  create: () => new Set(),
  update(hechos, tr) {
    for (const efecto of tr.effects) if (efecto.is(marcarHechos)) return new Set(efecto.value);
    return hechos;
  },
});

export const huecosDe = (state: EditorState) => state.field(campoHuecos, false) ?? [];

export const contenidoDeHuecos = (state: EditorState) => huecosDe(state).map(({ from, to }) => state.sliceDoc(from, to));

const campo = Decoration.mark({ class: 'cm-campo' });
const campoHecho = Decoration.mark({ class: 'cm-campo cm-campo-hecho' });

/** Un hueco que has dejado vacío: un recuadro para que se vea dónde escribir */
class CampoVacio extends WidgetType {
  constructor(readonly hecho: boolean) {
    super();
  }
  eq(otro: CampoVacio) {
    return otro.hecho === this.hecho;
  }
  toDOM() {
    const $campo = document.createElement('span');
    $campo.className = `cm-campo cm-campo-vacio${this.hecho ? ' cm-campo-hecho' : ''}`;
    return $campo;
  }
  ignoreEvent() {
    return false;
  }
}

function decorar(state: EditorState, solucion: boolean) {
  const hechos = state.field(campoHechos);
  const rangos = [];
  // Los huecos de un mismo TODO comparten franja: de la línea del primero a la del último
  const porTodo = new Map<string, Hueco[]>();
  for (const hueco of huecosDe(state)) porTodo.set(hueco.todo, [...(porTodo.get(hueco.todo) ?? []), hueco]);
  for (const [todo, suyos] of porTodo) {
    const hecho = hechos.has(todo);
    const primera = state.doc.lineAt(suyos[0].from).number;
    const ultima = state.doc.lineAt(suyos.at(-1)!.to).number;
    const estado = solucion ? 'cm-hueco-solucion' : hecho ? 'cm-hueco-hecho' : '';
    for (let numero = primera; numero <= ultima; numero++) {
      const linea = state.doc.line(numero);
      const clases = ['cm-hueco', estado, numero === primera && 'cm-hueco-primera', numero === ultima && 'cm-hueco-ultima'];
      rangos.push(
        Decoration.line({
          class: clases.filter(Boolean).join(' '),
          attributes: numero === primera ? { 'data-hueco': `${hecho ? '✓' : '✎'} ${todo}` } : undefined,
        }).range(linea.from),
      );
    }
    const enVerde = solucion || hecho;
    for (const { from, to } of suyos) {
      if (from < to) rangos.push((enVerde ? campoHecho : campo).range(from, to));
      else rangos.push(Decoration.widget({ widget: new CampoVacio(enVerde), side: 1 }).range(from));
    }
  }
  return Decoration.set(rangos, true);
}

function saltarAHueco(view: EditorView, direccion: 1 | -1) {
  const lista = huecosDe(view.state);
  if (!lista.length) return false;
  const pos = view.state.selection.main.head;
  const actual = lista.findIndex((h) => pos >= h.from && pos <= h.to);
  let destino: Hueco;
  if (actual >= 0) {
    destino = lista[(actual + direccion + lista.length) % lista.length];
  } else if (direccion === 1) {
    destino = lista.find((h) => h.from > pos) ?? lista[0];
  } else {
    destino = [...lista].reverse().find((h) => h.to < pos) ?? lista[lista.length - 1];
  }
  view.dispatch({
    selection: { anchor: destino.from, head: destino.to },
    effects: EditorView.scrollIntoView(destino.from, { y: 'center' }),
  });
  return true;
}

/**
 * Los huecos de un archivo. Con `solucion`, el archivo es de solo lectura y los huecos se pintan como solución.
 * `alBloquear` avisa cuando alguien intenta escribir fuera de un hueco.
 */
export function huecos(iniciales: Hueco[], { solucion = false, alBloquear }: { solucion?: boolean; alBloquear?: () => void } = {}): Extension {
  return [
    campoHuecos.init(() => iniciales),
    campoHechos,
    EditorView.decorations.compute(['doc', campoHuecos, campoHechos], (state) => decorar(state, solucion)),
    solucion
      ? []
      : [
          Prec.high(
            keymap.of([
              { key: 'Tab', preventDefault: true, run: (view) => saltarAHueco(view, 1) },
              { key: 'Shift-Tab', preventDefault: true, run: (view) => saltarAHueco(view, -1) },
            ]),
          ),
          EditorState.changeFilter.of((tr) => {
            const editables = huecosDe(tr.startState);
            let dentro = true;
            tr.changes.iterChangedRanges((desde, hasta) => {
              if (!editables.some((hueco) => desde >= hueco.from && hasta <= hueco.to)) dentro = false;
            });
            if (!dentro) alBloquear?.();
            return dentro;
          }),
        ],
  ];
}
