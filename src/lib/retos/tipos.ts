// Tipos del editor de los retos. Las comprobaciones de cada reto están en retos/<reto>/editor/comprobaciones.js

export interface Contexto {
  /** El window del iframe donde se ha ejecutado tu código (para las comprobaciones, uno oculto) */
  ventana: any;
  documento: Document;
  /** Importa uno de tus módulos ('webmcp.js') o un paquete: la misma instancia que usa main.js */
  importar<T = any>(ruta: string): Promise<T>;
  /** Repite la condición hasta que devuelva algo distinto de false/undefined, o falla con el mensaje */
  esperar<T>(condicion: () => T | Promise<T>, mensaje: string, ms?: number): Promise<T>;
  /** Cambia el fetch del iframe por uno falso que responde con `responder` y apunta las peticiones */
  fetchFalso(responder: (peticion: PeticionFalsa) => unknown): PeticionFalsa[];
  /** Si la condición es falsa, la comprobación falla con el mensaje */
  afirmar(condicion: unknown, mensaje: string): asserts condicion;
}

export interface PeticionFalsa {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo: any;
}

export interface Paso {
  titulo: string;
  /** Archivo y marca del TODO: al pulsar el paso, el editor salta a su hueco */
  archivo: string;
  todo: string;
  /** Se enseñan de una en una, de la más general a la casi solución. Admiten `código` entre comillas invertidas */
  pistas?: string[];
  comprobar(contexto: Contexto): unknown;
}

export interface Comprobaciones {
  pasos: Paso[];
  /** Módulos falsos para el iframe de las comprobaciones: especificador → código */
  falsos?: Record<string, string>;
  /** Si es true, los pasos solo se comprueban al pulsar Ejecutar (no mientras escribes) */
  soloAlEjecutar?: boolean;
}

/** Un hueco de un archivo editable: lo único que se puede cambiar. Lo marcan //[hueco TODO n] … //[/hueco] */
export interface HuecoDelArchivo {
  todo: string;
  /** Lo que tiene al empezar (con ___ donde falta algo) */
  inicio: string;
  solucion: string;
}

export interface ArchivoDelReto {
  ruta: string;
  /** El archivo al empezar, con los huecos sin rellenar */
  contenido: string;
  /** Con los huecos resueltos (solo los editables) */
  solucion?: string;
  /** El texto fijo que rodea a los huecos: trozos[0] + hueco 0 + trozos[1] + … (solo los editables) */
  trozos?: string[];
  huecos?: HuecoDelArchivo[];
  editable: boolean;
  oculto: boolean;
}

export interface ConfigDelEditor {
  slug: string;
  entrada: string;
  archivos: ArchivoDelReto[];
  preludios: string[];
  paneles: string[];
  /** Archivos que genera el editor al ejecutar, como la vista empaquetada del reto 1 */
  generados: { ruta: string; tipo: 'vista-mcp-app'; carpeta: string }[];
}
