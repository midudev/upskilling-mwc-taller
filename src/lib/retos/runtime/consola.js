// Se ejecuta dentro del iframe antes que tu código: reenvía al editor la consola y los errores.
(() => {
  const ID = '__RETO_ID__';
  const enviar = (tipo, datos = {}) => {
    try {
      parent.postMessage({ __reto: ID, tipo, ...datos }, '*');
    } catch {}
  };

  const formatear = (valor, profundidad = 0) => {
    if (typeof valor === 'string') return profundidad ? JSON.stringify(valor) : valor;
    if (valor instanceof Error) return valor.stack?.includes(valor.message) ? valor.stack : `${valor.name}: ${valor.message}\n${valor.stack ?? ''}`;
    if (typeof valor === 'function') return `ƒ ${valor.name || 'anónima'}()`;
    if (valor instanceof Node) return `<${valor.nodeName.toLowerCase()}>`;
    if (typeof valor !== 'object' || valor === null) return String(valor);
    try {
      const vistos = new WeakSet();
      return JSON.stringify(
        valor,
        (_, v) => {
          if (typeof v === 'function') return `ƒ ${v.name || 'anónima'}()`;
          if (v instanceof Node) return `<${v.nodeName.toLowerCase()}>`;
          if (typeof v === 'object' && v !== null) {
            if (vistos.has(v)) return '[circular]';
            vistos.add(v);
          }
          return v;
        },
        2,
      );
    } catch {
      return String(valor);
    }
  };

  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[nivel].bind(console);
    console[nivel] = (...argumentos) => {
      original(...argumentos);
      enviar('consola', { nivel, texto: argumentos.map((a) => formatear(a)).join(' ') });
    };
  }

  addEventListener('error', (evento) => {
    // Errores al cargar un recurso (una imagen, un script)
    if (!(evento instanceof ErrorEvent)) return;
    const { error, message, filename, lineno, colno } = evento;
    const donde = filename ? `\n    at ${filename}:${lineno}:${colno}` : '';
    enviar('error', { texto: error ? formatear(error) : `${message}${donde}` });
  });

  addEventListener('unhandledrejection', (evento) => {
    enviar('error', { texto: `(promesa) ${formatear(evento.reason)}` });
  });

  // ___ son los huecos sin rellenar: valen undefined y avisan, una vez por sitio, de dónde están
  const avisados = new Set();
  Object.defineProperty(globalThis, '___', {
    configurable: true,
    get() {
      const sitio = new Error().stack?.match(/blob:[^\s)]+:\d+:\d+/)?.[0];
      if (sitio && !avisados.has(sitio)) {
        avisados.add(sitio);
        console.warn(`Falta rellenar un ___ en ${sitio}`);
      }
      return undefined;
    },
  });

  // Las comprobaciones importan tus módulos desde fuera: comparten las mismas instancias que main.js
  window.__retoImportar = (especificador) => import(especificador);

  addEventListener('load', () => enviar('cargada'));
})();
