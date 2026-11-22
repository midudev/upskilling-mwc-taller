// Pasos del reto 5 y cómo se comprueba cada uno. Las comprobaciones no descargan ningún modelo:
// en su iframe, 'runonweb/translate', 'runonweb/embed' y 'runonweb/stt' son versiones falsas que
// apuntan cómo se usan y responden al momento.

/** @type {import('../../../src/lib/retos/tipos').Comprobaciones} */
export default {
  falsos: {
    'runonweb/translate': `
      export const registro = { creados: [], traducidos: [] };
      export class Translator {
        constructor(opciones = {}) {
          registro.creados.push({ from: opciones.from, to: opciones.to });
          opciones.onProgress?.({ status: 'progress', file: 'modelo.bin', loaded: 5, total: 10 });
        }
        async translate(texto) {
          registro.traducidos.push(texto);
          return { text: 'EN: ' + texto };
        }
      }
    `,
    'runonweb/embed': `
      export const registro = { creados: [], consultas: [] };
      // Un «modelo» de juguete: cada texto es un vector según su categoría (o, la petición, según lo que pide)
      const EJES = ['audio', 'viaje', 'escritorio', 'hogar'];
      const vector = (texto) => {
        const categoria = EJES.find((eje) => texto.includes('(' + eje + ')'));
        if (categoria) return EJES.map((eje) => (eje === categoria ? 1 : 0.1));
        return [0.9, 0.3, 0.1, 0];
      };
      export class TextEmbedder {
        constructor(opciones = {}) {
          registro.creados.push({ model: opciones.model, device: opciones.device });
        }
        async embed(entrada) {
          const textos = Array.isArray(entrada) ? entrada : [entrada];
          if (!Array.isArray(entrada)) registro.consultas.push(entrada);
          return { embeddings: textos.map(vector) };
        }
      }
      export function cosineSimilarity(a, b) {
        let producto = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) { producto += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        return producto / Math.sqrt(na * nb);
      }
    `,
    'runonweb/stt': `
      export const registro = { creados: [], audios: [] };
      export class SpeechToText {
        constructor(opciones = {}) {
          registro.creados.push({ model: opciones.model, language: opciones.language });
        }
        async transcribe(audio, { onPartial } = {}) {
          registro.audios.push(audio);
          onPartial?.(' quiero');
          onPartial?.(' quiero café caliente');
          return { text: ' quiero café caliente ' };
        }
      }
    `,
  },
  pasos: [
    {
      titulo: 'Traducir las reseñas',
      archivo: 'runonweb.js',
      todo: 'TODO 1',
      pistas: [
        'El traductor ya está creado justo encima (`traductor`). Su método `translate(texto)` devuelve una promesa con `{ text }`.',
        'Lo que hay que traducir es el texto de cada reseña: `traductor.translate(reseña.texto)`.',
      ],
      async comprobar({ importar, afirmar }) {
        const { traducirReseñas } = await importar('runonweb.js');
        const { registro } = await importar('runonweb/translate');
        const producto = { reseñas: [{ texto: 'Muy cómoda' }, { texto: 'Llegó tarde' }] };
        const progreso = [];

        const traducciones = await traducirReseñas(producto, { alProgresar: (porcentaje) => progreso.push(porcentaje) });
        afirmar(registro.creados.length === 1, 'Crea el traductor con new Translator({ from, to, onProgress }).');
        afirmar(
          registro.creados[0].from === 'es' && registro.creados[0].to === 'en',
          "Del español al inglés: { from: 'es', to: 'en' }.",
        );
        afirmar(progreso.includes(50), 'Pasa onProgress: progreso(alProgresar) para ver la descarga en la interfaz.');
        afirmar(Array.isArray(traducciones), 'Devuelve una lista con una traducción por reseña.');
        afirmar(
          traducciones.join('|') === 'EN: Muy cómoda|EN: Llegó tarde',
          'Traduce reseña.texto de cada reseña, en orden, y devuelve el `text` de cada resultado.',
        );

        await traducirReseñas(producto);
        afirmar(registro.creados.length === 1, 'El traductor se crea una sola vez: traductor ??= new Translator(…).');
      },
    },
    {
      titulo: 'Buscar por significado',
      archivo: 'runonweb.js',
      todo: 'TODO 2',
      pistas: [
        'La petición se convierte en vector igual que los productos, dos líneas más arriba: con `embedder.embed(…)`.',
        '`await embedder.embed(peticion)` y, para comparar, `cosineSimilarity(consulta, vectores[indice])`.',
      ],
      async comprobar({ importar, afirmar }) {
        const { buscarPorSignificado } = await importar('runonweb.js');
        const { todosLosProductos } = await importar('tienda.js');
        const { registro } = await importar('runonweb/embed');

        const lista = await buscarPorSignificado('algo para escuchar música', todosLosProductos());
        afirmar(registro.consultas.includes('algo para escuchar música'), 'Convierte la petición en un vector: embedder.embed(peticion).');
        afirmar(Array.isArray(lista), 'Devuelve una lista [{ producto, encaje }].');
        afirmar(lista.length === 4, `Devuelve los 4 más parecidos (slice(0, 4)) y has devuelto ${lista.length}.`);
        afirmar(
          lista.every((item) => item?.producto?.id && typeof item.encaje === 'number' && item.encaje >= 0 && item.encaje <= 1),
          'Cada elemento es { producto, encaje }, con encaje entre 0 y 1.',
        );
        afirmar(
          lista.slice(0, 3).every((item) => item.producto.categoria === 'audio'),
          'Ordena de mayor a menor encaje: para esta petición, los 3 primeros son los productos de audio.',
        );
        afirmar(
          lista.every((item, i) => i === 0 || lista[i - 1].encaje >= item.encaje),
          'La lista tiene que ir de mayor a menor encaje.',
        );
      },
    },
    {
      titulo: 'Dictar la búsqueda',
      archivo: 'runonweb.js',
      todo: 'TODO 3',
      pistas: [
        'El reconocedor (`oido`) tiene un método `transcribe(audio, opciones)` que devuelve `{ text }`.',
        '`oido.transcribe(audio, { onPartial: alEscribir })`: así el texto aparece según se dicta.',
      ],
      async comprobar({ importar, afirmar, ventana }) {
        const { dictar } = await importar('runonweb.js');
        const { registro } = await importar('runonweb/stt');
        const audio = new ventana.Blob(['audio'], { type: 'audio/webm' });
        const parciales = [];

        const texto = await dictar(audio, { alEscribir: (parcial) => parciales.push(parcial) });
        afirmar(registro.creados.length === 1, 'Crea el reconocedor con new SpeechToText({ … }).');
        afirmar(registro.creados[0].language === 'es', "Whisper tiene que escuchar en español: language: 'es'.");
        afirmar(registro.creados[0].model?.includes('whisper'), "Usa el modelo multilingüe: model: 'onnx-community/whisper-base'.");
        afirmar(registro.audios[0] === audio, 'Pásale el audio a oido.transcribe(audio, …).');
        afirmar(parciales.length === 2, 'Pasa alEscribir como onPartial para ver el texto según se escribe.');
        afirmar(texto === 'quiero café caliente', `Devuelve el texto sin espacios de más (text.trim()) y ha salido ${JSON.stringify(texto)}.`);

        await dictar(audio);
        afirmar(registro.creados.length === 1, 'El reconocedor se crea una sola vez: oido ??= new SpeechToText(…).');
      },
    },
  ],
};
