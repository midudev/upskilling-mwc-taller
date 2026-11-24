// Ejecuta las comprobaciones de un reto en un iframe oculto, con tu código recién cargado.
// Así no tocan lo que estás viendo en la pestaña «Resultado» (ni el carrito ni las llamadas a las APIs).
import { ejecutar, traducir } from './ejecutar';
import type { Comprobaciones, Contexto, PeticionFalsa } from './tipos';

export type Estado = { ok: true } | { ok: false; mensaje: string };

const LIMITE = 12000;

// Los errores que lanza tu código son del iframe (otro «realm»): instanceof Error no los reconoce
const mensajeDe = (error: any) => String(error?.message ?? error);

function crearContexto(ventana: any, archivos: Map<string, string>): Contexto {
  const afirmar: Contexto['afirmar'] = (condicion, mensaje) => {
    if (!condicion) throw new Error(mensaje);
  };

  return {
    ventana,
    documento: ventana.document,
    // Tus archivos se importan como '@reto/<ruta>' (ver ejecutar.ts); los paquetes, por su nombre
    importar: (ruta) => ventana.__retoImportar(archivos.has(ruta) ? `@reto/${ruta}` : ruta),
    async esperar(condicion, mensaje, ms = 3000) {
      const fin = performance.now() + ms;
      let ultimo: unknown;
      while (performance.now() < fin) {
        try {
          const valor = await condicion();
          if (valor !== false && valor !== undefined && valor !== null) return valor as any;
        } catch (error) {
          ultimo = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      throw new Error(ultimo ? `${mensaje} (${mensajeDe(ultimo)})` : mensaje);
    },
    fetchFalso(responder) {
      const peticiones: PeticionFalsa[] = [];
      ventana.fetch = async (entrada: RequestInfo | URL, opciones: RequestInit = {}) => {
        const cabeceras: Record<string, string> = {};
        new Headers(opciones.headers).forEach((valor, nombre) => (cabeceras[nombre] = valor));
        let cuerpo: any = opciones.body;
        try {
          cuerpo = typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo;
        } catch {}
        const peticion = { url: String(entrada), metodo: (opciones.method ?? 'GET').toUpperCase(), cabeceras, cuerpo };
        peticiones.push(peticion);
        const respuesta = await responder(peticion);
        if (respuesta instanceof ventana.Response || respuesta instanceof Response) return respuesta;
        return new ventana.Response(JSON.stringify(respuesta), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
      return peticiones;
    },
    afirmar,
  };
}

const conLimite = <T>(promesa: Promise<T>, ms: number) =>
  Promise.race([
    promesa,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`No ha terminado en ${ms / 1000} s: ¿falta un await o un return?`)), ms),
    ),
  ]);

export async function comprobar(
  { pasos, falsos }: Comprobaciones,
  opciones: {
    archivos: Map<string, string>;
    entrada: string;
    preludios: string[];
    contenedor: HTMLElement;
    /** Si devuelve un mensaje para un paso, se marca como fallido sin ejecutar su comprobación */
    omitir?: (indice: number) => string | null;
  },
  alComprobar: (indice: number, estado: Estado) => void,
  cancelada: () => boolean,
) {
  const omitidos = pasos.map((_, indice) => opciones.omitir?.(indice) ?? null);
  if (omitidos.every((mensaje) => mensaje !== null)) {
    omitidos.forEach((mensaje, indice) => alComprobar(indice, { ok: false, mensaje: mensaje! }));
    return;
  }

  const ejecucion = ejecutar({ ...opciones, falsos, oculto: true });
  try {
    await conLimite(ejecucion.cargada, 15000);
    // Deja que terminen los await de nivel superior de main.js
    await new Promise((resolve) => setTimeout(resolve, 150));

    for (const [indice, paso] of pasos.entries()) {
      if (cancelada()) return;
      if (omitidos[indice] !== null) {
        alComprobar(indice, { ok: false, mensaje: omitidos[indice]! });
        continue;
      }
      const contexto = crearContexto(ejecucion.iframe.contentWindow, opciones.archivos);
      try {
        await conLimite(Promise.resolve(paso.comprobar(contexto)), LIMITE);
        alComprobar(indice, { ok: true });
      } catch (error) {
        alComprobar(indice, { ok: false, mensaje: traducir(mensajeDe(error), ejecucion.rutas) });
      }
    }
  } catch (error) {
    const mensaje = mensajeDe(error);
    pasos.forEach((_, indice) => alComprobar(indice, { ok: false, mensaje: omitidos[indice] ?? mensaje }));
  } finally {
    ejecucion.cerrar();
  }
}
