// Tema de CodeMirror con los colores de la web (los mismos que el resaltado de Shiki de global.css)
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const colores = {
  keyword: '#ff3d7f',
  function: '#c26bff',
  constant: '#3b9bff',
  parameter: '#ffb000',
  string: '#3fdc6f',
  comment: '#a1a1a1',
};

export const tema = EditorView.theme(
  {
    '&': { height: '100%', color: 'var(--fg)', backgroundColor: 'var(--surface)', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.65' },
    '.cm-content': { caretColor: 'var(--accent)', paddingBlock: '0.75rem' },
    '.cm-gutters': { backgroundColor: 'var(--surface)', color: '#5c5c5c', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { paddingInline: '0.75rem 0.5rem' },
    '.cm-activeLine': { backgroundColor: '#ffffff07' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: '#ff3b3040 !important' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: '#ffffff1a', outline: 'none' },
    '.cm-selectionMatch': { backgroundColor: '#ffffff12' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)' },
    '.cm-tooltip': { backgroundColor: '#161616', border: '1px solid var(--line)', color: 'var(--fg)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#ff3b3033', color: 'var(--fg)' },
    '.cm-panels': { backgroundColor: '#161616', color: 'var(--fg)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
    '.cm-searchMatch': { backgroundColor: '#ffb00033', outline: '1px solid #ffb00066' },
    // El enunciado de cada hueco: el comentario con «TODO n» justo encima
    '.cm-todo': { color: '#ffb000', fontStyle: 'normal', fontWeight: '700' },
    '.cm-todo-linea': { backgroundColor: '#ffb00008' },
    // Los huecos (huecos.ts): lo único que se edita. Amarillo mientras falta; verde cuando su paso está hecho
    '.cm-hueco': { backgroundColor: '#ffb00017', boxShadow: 'inset 3px 0 0 #ffb000' },
    '.cm-hueco-primera': { position: 'relative', boxShadow: 'inset 3px 0 0 #ffb000, inset 0 1px 0 #ffb00040' },
    '.cm-hueco-ultima': { boxShadow: 'inset 3px 0 0 #ffb000, inset 0 -1px 0 #ffb00040' },
    '.cm-hueco-primera.cm-hueco-ultima': { boxShadow: 'inset 3px 0 0 #ffb000, inset 0 1px 0 #ffb00040, inset 0 -1px 0 #ffb00040' },
    '.cm-hueco-primera::after': {
      content: 'attr(data-hueco)',
      position: 'absolute',
      top: '0',
      right: '0.6rem',
      color: '#ffb000',
      fontSize: '10px',
      opacity: '0.85',
      pointerEvents: 'none',
    },
    '.cm-hueco.cm-hueco-hecho, .cm-hueco.cm-hueco-solucion': { backgroundColor: '#3fdc6f12', boxShadow: 'inset 3px 0 0 #3fdc6f' },
    '.cm-hueco-hecho.cm-hueco-primera::after, .cm-hueco-solucion.cm-hueco-primera::after': { color: '#3fdc6f' },
    '.cm-hueco-solucion.cm-hueco-primera::after': { content: '"solución"' },
    // Cada hueco: el recuadro donde se escribe. Amarillo mientras falta; verde cuando su paso está hecho
    '.cm-campo': {
      padding: '0 2px',
      borderRadius: '3px',
      backgroundColor: '#ffb00026',
      outline: '1px dashed #ffb000',
      color: '#ffd27a',
    },
    '.cm-campo-hecho': { backgroundColor: '#3fdc6f1f', outline: '1px solid #3fdc6f80', color: 'inherit' },
    '.cm-campo-vacio': { display: 'inline-block', width: '3ch', height: '1.2em', verticalAlign: 'text-bottom' },
  },
  { dark: true },
);

export const resaltado = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: colores.keyword },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: colores.function },
    { tag: [t.number, t.bool, t.null, t.atom, t.className, t.typeName, t.self], color: colores.constant },
    { tag: [t.string, t.special(t.string), t.regexp, t.attributeValue, t.url], color: colores.string },
    { tag: [t.definition(t.variableName), t.local(t.variableName)], color: colores.parameter },
    { tag: [t.comment, t.lineComment, t.blockComment], color: colores.comment, fontStyle: 'italic' },
    { tag: [t.tagName, t.heading], color: colores.keyword },
    { tag: [t.attributeName, t.propertyName], color: '#ededed' },
    { tag: t.invalid, color: '#ff6b6b' },
  ]),
);

// Las marcas «TODO N» de los comentarios, en rojo y con la línea señalada
const marcaTodo = new MatchDecorator({
  regexp: /TODO \d+/g,
  decoration: Decoration.mark({ class: 'cm-todo' }),
});

const lineaTodo = Decoration.line({ class: 'cm-todo-linea' });

export const todos = ViewPlugin.fromClass(
  class {
    marcas: DecorationSet;
    lineas: DecorationSet;
    constructor(view: EditorView) {
      this.marcas = marcaTodo.createDeco(view);
      this.lineas = this.calcularLineas(view);
    }
    update(update: ViewUpdate) {
      this.marcas = marcaTodo.updateDeco(update, this.marcas);
      if (update.docChanged || update.viewportChanged) this.lineas = this.calcularLineas(update.view);
    }
    calcularLineas(view: EditorView) {
      const rangos = [];
      for (const { from, to } of view.visibleRanges) {
        for (let posicion = from; posicion <= to; ) {
          const linea = view.state.doc.lineAt(posicion);
          if (/\/\/\s*TODO \d+/.test(linea.text)) rangos.push(lineaTodo.range(linea.from));
          posicion = linea.to + 1;
        }
      }
      return Decoration.set(rangos);
    }
  },
  {
    provide: (plugin) => [
      EditorView.decorations.of((view) => view.plugin(plugin)?.marcas ?? Decoration.none),
      EditorView.decorations.of((view) => view.plugin(plugin)?.lineas ?? Decoration.none),
    ],
  },
);
