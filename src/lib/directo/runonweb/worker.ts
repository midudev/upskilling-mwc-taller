// directo/runonweb/foto.js (el código que se descomenta en directo) se ejecuta en este Web Worker:
// descargar, preparar y ejecutar los tres modelos no bloquea la página. Aquí solo se reenvían llamadas y avisos.

export type Funcion = 'quitarFondo' | 'describir' | 'leer';
export type Peticion = { id: number; funcion: Funcion; args: unknown[] };
export type Mensaje =
  | { tipo: 'listo'; funciones: Funcion[] }
  | { tipo: 'fallo'; mensaje: string }
  | { tipo: 'aviso'; detalle: unknown }
  | { tipo: 'parcial'; id: number; texto: string }
  | { tipo: 'resultado'; id: number; valor: unknown }
  | { tipo: 'error'; id: number; mensaje: string };

const FUNCIONES: Funcion[] = ['quitarFondo', 'describir', 'leer'];

// runonweb comprueba `foto instanceof HTMLImageElement` (y canvas) antes de leer un Blob, y en un worker
// esas clases no existen: sin ellas, la comprobación lanza un ReferenceError
const global = globalThis as Record<string, unknown>;
global.HTMLImageElement ??= class {};
global.HTMLCanvasElement ??= class {};

const enviar = (mensaje: Mensaje) => self.postMessage(mensaje);
const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));

// foto.js avisa del progreso de cada descarga con un evento 'runonweb': se reenvía a la página
self.addEventListener('runonweb', (evento) => enviar({ tipo: 'aviso', detalle: (evento as CustomEvent).detail }));

type Modulo = Partial<Record<Funcion, (...args: unknown[]) => Promise<unknown>>>;

const foto: Promise<Modulo> = import('../../../../directo/runonweb/foto.js').then(
  (modulo: Modulo) => {
    enviar({ tipo: 'listo', funciones: FUNCIONES.filter((funcion) => typeof modulo[funcion] === 'function') });
    return modulo;
  },
  (error) => {
    enviar({ tipo: 'fallo', mensaje: mensajeDe(error) });
    throw error;
  },
);

self.addEventListener('message', async (evento: MessageEvent<Peticion>) => {
  const { id, funcion, args } = evento.data;
  try {
    const ejecutar = (await foto)[funcion];
    if (!ejecutar) throw new Error(`foto.js no exporta ${funcion}`);
    // Tras sus argumentos, cada función recibe un callback para lo parcial (describir lo usa para el texto)
    const valor = await ejecutar(...args, (texto: string) => enviar({ tipo: 'parcial', id, texto }));
    enviar({ tipo: 'resultado', id, valor });
  } catch (error) {
    enviar({ tipo: 'error', id, mensaje: mensajeDe(error) });
  }
});
