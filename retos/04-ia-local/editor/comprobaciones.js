// Pasos del reto 4 y cómo se comprueba cada uno. Las comprobaciones no descargan ningún modelo:
// usan un Summarizer falso y una versión falsa de Transformers.js que «escribe» un resumen inventado.

const PRODUCTO = {
  id: 'mochila-viaje',
  nombre: 'Mochila de viaje 28 L',
  reseñas: [
    { autor: 'Ana', nota: 5, texto: 'Cabe todo y es muy cómoda.' },
    { autor: 'Leo', nota: 3, texto: 'La cremallera se atasca.' },
  ],
};

/** Un Summarizer con el que ver qué opciones recibe y qué se le pide */
function summarizerFalso(ventana, { disponible = 'available', trozos = ['Los clientes ', 'valoran que es cómoda.'] } = {}) {
  const registro = { availability: [], create: null, entrada: null };
  ventana.Summarizer = {
    async availability(opciones) {
      registro.availability.push(opciones);
      return disponible;
    },
    async create(opciones) {
      registro.create = opciones;
      const monitor = new ventana.EventTarget();
      opciones?.monitor?.(monitor);
      monitor.dispatchEvent(Object.assign(new ventana.Event('downloadprogress'), { loaded: 0.5 }));
      return {
        summarizeStreaming(texto) {
          registro.entrada = texto;
          return (async function* () {
            for (const trozo of trozos) yield trozo;
          })();
        },
        destroy() {},
      };
    },
  };
  return registro;
}

/** @type {import('../../../src/lib/retos/tipos').Comprobaciones} */
export default {
  // En el iframe de las comprobaciones, '@huggingface/transformers' es esto: un modelo que no pesa nada
  falsos: {
    '@huggingface/transformers': `
      export const llamadas = [];
      export async function pipeline(tarea, modelo, opciones = {}) {
        llamadas.push({ tarea, modelo, device: opciones.device, dtype: opciones.dtype });
        opciones.progress_callback?.({ status: 'initiate', file: 'model.onnx' });
        opciones.progress_callback?.({ status: 'progress_total', progress: 42.4 });
        const generador = async (mensajes, { streamer } = {}) => {
          for (const trozo of ['Los clientes ', 'valoran ', 'la comodidad.']) streamer?.callback_function?.(trozo);
          return [{ generated_text: [...mensajes, { role: 'assistant', content: 'Los clientes valoran la comodidad.' }] }];
        };
        generador.tokenizer = {};
        return generador;
      }
      export class TextStreamer {
        constructor(tokenizer, opciones = {}) {
          Object.assign(this, opciones);
        }
      }
    `,
  },
  pasos: [
    {
      titulo: '¿Tiene el navegador la API Summarizer?',
      archivo: 'ia-local.js',
      todo: 'TODO 1',
      pistas: [
        'Comprueba si la propiedad `Summarizer` existe en el objeto global `self` usando el operador `in`.',
        "Si no existe: `'Summarizer' in self` (el `!` de fuera ya lo niega para devolver `'unavailable'`).",
      ],
      async comprobar({ importar, ventana, afirmar }) {
        const { disponibilidad } = await importar('ia-local.js');

        delete ventana.Summarizer;
        let sin;
        try {
          sin = await disponibilidad();
        } catch (error) {
          afirmar(false, `Sin Summarizer ha fallado (${error.message}). Comprueba si existe con 'Summarizer' in self.`);
        }
        afirmar(sin === 'unavailable', `Sin Summarizer debería devolver 'unavailable' y devuelve ${JSON.stringify(sin)}.`);

        const registro = summarizerFalso(ventana, { disponible: 'downloadable' });
        const con = await disponibilidad();
        afirmar(registro.availability.length === 1, 'Cuando Summarizer existe en self, debería continuar y llamar a Summarizer.availability().');
        afirmar(con === 'downloadable', `Cuando Summarizer existe, debería devolver 'downloadable' y devuelve ${JSON.stringify(con)}.`);
      },
    },
    {
      titulo: 'Crear y configurar el resumidor',
      archivo: 'ia-local.js',
      todo: 'TODO 2',
      pistas: [
        'El resumidor se crea llamando a `Summarizer.create({ … })`.',
        "Elige uno de los tipos del comentario (por ejemplo `'tldr'`) y el idioma de salida en español: `'es'`.",
      ],
      async comprobar({ importar, ventana, afirmar }) {
        const { resumirConChrome } = await importar('ia-local.js');
        const registro = summarizerFalso(ventana);
        const progreso = [];

        try {
          await resumirConChrome(PRODUCTO, {
            alProgresar: (porcentaje) => progreso.push(porcentaje),
            alEscribir: () => {},
          });
        } catch (error) {
          if (!registro.create) {
            afirmar(false, `Crea el resumidor con Summarizer.create({ … }) (${error.message}).`);
          }
        }

        afirmar(registro.create, 'Crea el resumidor con Summarizer.create({ … }).');
        const tiposValidos = ['key-points', 'tldr', 'teaser', 'headline'];
        afirmar(
          tiposValidos.includes(registro.create.type),
          `Elige un tipo de resumen válido ('tldr', 'key-points', 'teaser' o 'headline') y has puesto ${JSON.stringify(registro.create.type)}.`,
        );
        afirmar(
          registro.create.outputLanguage === 'es',
          `El resumen tiene que salir en español: outputLanguage: 'es' (ahora es ${JSON.stringify(registro.create.outputLanguage)}).`,
        );
        afirmar(progreso.includes(50), 'El monitor de descarga debería seguir avisando con alProgresar.');
      },
    },
    {
      titulo: 'Resumir con Gemini Nano, en streaming',
      archivo: 'ia-local.js',
      todo: 'TODO 3',
      pistas: [
        'El resumidor ya está creado (`summarizer`). Su método `summarizeStreaming(texto)` devuelve el resumen a trozos, según se escribe.',
        'El texto es el de las reseñas: `summarizer.summarizeStreaming(textoDeReseñas(producto))`.',
      ],
      async comprobar({ importar, ventana, afirmar }) {
        const { resumirConChrome } = await importar('ia-local.js');
        const registro = summarizerFalso(ventana);
        const progreso = [];
        const escrito = [];

        const resultado = await resumirConChrome(PRODUCTO, {
          alProgresar: (porcentaje) => progreso.push(porcentaje),
          alEscribir: (parcial) => escrito.push(parcial),
        });

        afirmar(registro.create, 'Crea el resumidor con Summarizer.create({ … }).');
        afirmar(registro.entrada !== null, 'No se pide ningún resumen: llama a summarizer.summarizeStreaming(…).');
        afirmar(registro.entrada?.includes('Cabe todo'), 'Pásale el texto de las reseñas: summarizeStreaming(textoDeReseñas(producto)).');
        afirmar(
          escrito.join('|') === 'Los clientes |Los clientes valoran que es cómoda.',
          'Con cada trozo, súmalo a `texto` y llama a alEscribir(texto) con todo lo que llevas.',
        );
        afirmar(resultado?.texto === 'Los clientes valoran que es cómoda.', 'Devuelve { texto, motor } con el texto completo.');
        afirmar(resultado.motor, 'Devuelve también el motor: { texto, motor }.');
      },
    },
    {
      titulo: 'Plan B: cargar el modelo con Transformers.js',
      archivo: 'ia-local.js',
      todo: 'TODO 4',
      pistas: [
        '`pipeline` recibe la tarea, el modelo (la constante `MODELO`) y las opciones: dónde se ejecuta (`device`), la precisión (`dtype`) y el aviso de progreso.',
        "`pipeline('text-generation', MODELO, { device, dtype, progress_callback })`: las tres variables ya están definidas justo encima.",
      ],
      async comprobar({ importar, afirmar }) {
        const { resumirConTransformers } = await importar('ia-local.js');
        const { llamadas } = await importar('@huggingface/transformers');
        const progreso = [];

        const resultado = await resumirConTransformers(PRODUCTO, { alProgresar: (porcentaje) => progreso.push(porcentaje) });
        const [carga] = llamadas;
        afirmar(carga, 'Carga el modelo con pipeline().');
        afirmar(carga.tarea === 'text-generation', `La tarea es 'text-generation' y has puesto ${JSON.stringify(carga.tarea)}.`);
        afirmar(carga.modelo?.includes('Qwen3.5'), 'El segundo argumento es el modelo: MODELO.');
        afirmar(carga.device && carga.dtype, 'En las opciones van { device, dtype }: así usa la GPU si la hay.');
        afirmar(progreso.includes(42), 'Pásale también progress_callback en las opciones: así se ve la descarga.');
        afirmar(resultado?.texto === 'Los clientes valoran la comodidad.', 'resumirConTransformers debería devolver el texto del modelo.');

        await resumirConTransformers(PRODUCTO);
        afirmar(llamadas.length === 1, 'El modelo se carga una sola vez: generador ??= await pipeline(…).');
      },
    },
    {
      titulo: 'Plan B: el resumen, según se escribe',
      archivo: 'ia-local.js',
      todo: 'TODO 5',
      pistas: [
        'Cada vez que el modelo escribe algo, llega en `trozo`. `texto` guarda todo lo escrito hasta ahora.',
        '`texto += trozo` y después `alEscribir?.(texto)`, con todo el texto, no solo el trozo.',
      ],
      async comprobar({ importar, afirmar }) {
        const { resumirConTransformers } = await importar('ia-local.js');
        const escrito = [];
        await resumirConTransformers(PRODUCTO, { alEscribir: (parcial) => escrito.push(parcial) });
        afirmar(escrito.length > 0, 'En callback_function, llama a alEscribir(texto) con cada trozo.');
        afirmar(
          escrito.join('|') === 'Los clientes |Los clientes valoran |Los clientes valoran la comodidad.',
          'Suma cada trozo a `texto` antes de llamar a alEscribir(texto): tiene que recibir todo lo escrito hasta ahora.',
        );
      },
    },
  ],
};
