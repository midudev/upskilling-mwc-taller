// La página de /directo/runonweb habla con foto.js a través de un Web Worker (./worker.ts): las mismas
// funciones, pero los modelos se descargan y se ejecutan fuera del hilo principal.
import type { Funcion, Mensaje, Peticion } from './worker.ts';

export type { Funcion };

export function conectar() {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pendientes = new Map<number, { resolver: (valor: unknown) => void; rechazar: (error: Error) => void; alParcial?: (texto: string) => void }>();
  let siguiente = 0;

  let alEstarListo: (funciones: Funcion[]) => void;
  let alFallar: (error: Error) => void;
  const listo = new Promise<Funcion[]>((resolver, rechazar) => {
    alEstarListo = resolver;
    alFallar = rechazar;
  });

  worker.addEventListener('message', (evento: MessageEvent<Mensaje>) => {
    const mensaje = evento.data;
    switch (mensaje.tipo) {
      case 'listo':
        return alEstarListo(mensaje.funciones);
      case 'fallo':
        return alFallar(new Error(mensaje.mensaje));
      case 'aviso':
        // La página ya escucha estos avisos en window, como si foto.js se ejecutara aquí
        return dispatchEvent(new CustomEvent('runonweb', { detail: mensaje.detalle }));
      case 'parcial':
        return pendientes.get(mensaje.id)?.alParcial?.(mensaje.texto);
      case 'resultado':
        pendientes.get(mensaje.id)?.resolver(mensaje.valor);
        return pendientes.delete(mensaje.id);
      case 'error':
        pendientes.get(mensaje.id)?.rechazar(new Error(mensaje.mensaje));
        return pendientes.delete(mensaje.id);
    }
  });

  // Si el worker se cae (o foto.js no se puede ni cargar), que nada se quede esperando
  worker.addEventListener('error', (evento) => {
    const error = new Error(evento.message || 'El worker de runonweb se ha caído');
    alFallar(error);
    for (const { rechazar } of pendientes.values()) rechazar(error);
    pendientes.clear();
  });

  function llamar<T>(funcion: Funcion, args: unknown[], alParcial?: (texto: string) => void) {
    return new Promise<T>((resolver, rechazar) => {
      const id = siguiente++;
      pendientes.set(id, { resolver: resolver as (valor: unknown) => void, rechazar, alParcial });
      worker.postMessage({ id, funcion, args } satisfies Peticion);
    });
  }

  return {
    /** Las funciones que exporta foto.js ahora mismo (las de los pasos ya descomentados) */
    listo,
    quitarFondo: (foto: Blob) => llamar<Blob>('quitarFondo', [foto]),
    describir: (foto: Blob, alEscribir?: (texto: string) => void) => llamar<string>('describir', [foto], alEscribir),
    leer: (texto: string) => llamar<Blob>('leer', [texto]),
  };
}
