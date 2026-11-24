// Reto 3 · Jev: decisiones rápidas y estructuradas.
// Jev no genera texto: responde preguntas sobre un contenido (state) con datos que tu código usa tal cual:
// una opción (choice), una puntuación (score) o la probabilidad de un «sí» (noul).
import { API_URL, TOKEN } from './config.js';
import { todosLosProductos } from './tienda.js';

/** Envía un contenido y varias preguntas a Jev. Devuelve las respuestas, con el mismo nombre que cada pregunta */
export async function preguntarAJev(state, questions) {
  const respuesta = await fetch(`${API_URL}/api/jev`, {
    method: 'POST',
    // TODO 1: el token del taller (TOKEN) va en la cabecera Authorization, y el cuerpo es un JSON con state y questions
    //[hueco TODO 1]
    headers: { Authorization: `Bearer ${___}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(___),
    //[solución]
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, questions }),
    //[/hueco]
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(`Jev ha respondido ${respuesta.status}: ${datos.error?.message ?? JSON.stringify(datos.detail)}`);
  }
  return datos.answers;
}

const NIVELES = ['No encaja con lo que pide', 'Encaja solo en parte', 'Encaja muy bien con lo que pide'];

/**
 * Ordena el catálogo según lo bien que encaja con lo que pide el cliente.
 * Una sola llamada a Jev, con una pregunta `score` por producto.
 * Devuelve [{ producto, encaje }], con encaje entre 0 y 1, de mayor a menor.
 */
export async function busquedaInteligente(peticion) {
  const productos = todosLosProductos();

  const questions = {};
  for (const producto of productos) {
    questions[producto.id] = {
      // TODO 2: cada producto se puntúa en una escala ('score') usando los NIVELES como criteria
      //[hueco TODO 2]
      type: ___,
      //[solución]
      type: 'score',
      //[/hueco]
      instructions: {
        tarea: '¿Cuánto encaja este producto con la petición del cliente? Ten en cuenta el uso y el presupuesto.',
        producto: {
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          categoria: producto.categoria,
          precio_en_euros: producto.precio,
        },
      },
      //[hueco TODO 2]
      criteria: ___,
      //[solución]
      criteria: NIVELES,
      //[/hueco]
    };
  }

  const answers = await preguntarAJev({ peticion_del_cliente: peticion }, questions);
  console.log('Respuestas de Jev:', answers);

  return productos
    .map((producto) => ({
      producto,
      encaje: answers[producto.id].score / 2,
    }))
    .filter(({ encaje }) => encaje >= 0.5)
    .sort((a, b) => b.encaje - a.encaje);
}

/**
 * Decide si una reseña se publica y le pone nota. Tres preguntas en una sola llamada.
 * Devuelve { publicar: true, nota } o { publicar: false, motivo }.
 */
export async function moderarReseña(texto, producto) {
  const answers = await preguntarAJev(
    { producto: producto.nombre, reseña: texto },
    {
      // TODO 3: inapropiada es una pregunta de sí/no ('noul') y tema elige entre opciones ('choice')
      inapropiada: {
        //[hueco TODO 3]
        type: ___,
        //[solución]
        type: 'noul',
        //[/hueco]
        instructions: '¿La reseña contiene insultos, spam, publicidad o datos personales?',
      },
      tema: {
        //[hueco TODO 3]
        type: ___,
        //[solución]
        type: 'choice',
        //[/hueco]
        instructions: '¿De qué trata la reseña?',
        criteria: {
          producto: 'Opina sobre el producto, su calidad o su uso',
          envio: 'Habla solo del envío o de la entrega',
          otro: 'No tiene relación con el producto ni con la compra',
        },
      },
      nota: {
        type: 'score',
        instructions: '¿Qué valoración le da el cliente al producto?',
        criteria: ['Muy mala', 'Mala', 'Regular', 'Buena', 'Muy buena'],
      },
    },
  );
  console.log('Respuestas de Jev:', answers);

  // TODO 4: el código decide con números. answers.inapropiada.noul es la probabilidad de «sí» (de 0 a 1)
  // y answers.nota.score va de 0 (Muy mala) a 4 (Muy buena): pásalo a estrellas, de 1 a 5
  //[hueco TODO 4]
  const inapropiada = ___;
  const estrellas = ___;
  //[solución]
  const inapropiada = answers.inapropiada.noul > 0.5;
  const estrellas = Math.round(answers.nota.score) + 1;
  //[/hueco]

  if (inapropiada) {
    return { publicar: false, motivo: 'contiene contenido inapropiado' };
  }
  // Si no habla del producto y Jev está bastante seguro, tampoco se publica
  if (answers.tema.choice === 'otro' && answers.tema.confidence > 0.6) {
    return { publicar: false, motivo: 'no habla del producto' };
  }
  return { publicar: true, nota: estrellas };
}
