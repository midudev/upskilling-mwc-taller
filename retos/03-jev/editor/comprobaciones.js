// Pasos del reto 3 y cómo se comprueba cada uno. Las comprobaciones llaman a Jev de verdad
// a través de /api/jev con el token del taller, observando las peticiones reales de fetch sin
// sustituir las respuestas. Solo se lanzan al pulsar Ejecutar (no mientras escribes).

/** Observa las llamadas reales a fetch y guarda petición y respuesta JSON sin falsear nada */
async function conFetchEspiado(ventana, fn) {
  const fetchReal = ventana.fetch.bind(ventana);
  const peticiones = [];
  ventana.fetch = async (entrada, opciones = {}) => {
    const cabeceras = {};
    new Headers(opciones.headers).forEach((valor, nombre) => (cabeceras[nombre] = valor));
    let cuerpo = opciones.body;
    try {
      cuerpo = typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo;
    } catch {}
    const registro = {
      url: String(entrada),
      metodo: (opciones.method ?? 'GET').toUpperCase(),
      cabeceras,
      cuerpo,
      estado: 0,
      respuesta: null,
    };
    peticiones.push(registro);
    const res = await fetchReal(entrada, opciones);
    registro.estado = res.status;
    try {
      registro.respuesta = await res.clone().json();
    } catch {}
    return res;
  };
  try {
    return await fn(peticiones);
  } finally {
    ventana.fetch = fetchReal;
  }
}

const exigirToken = (TOKEN, afirmar) =>
  afirmar(TOKEN, 'Guarda primero el token del taller arriba en la web para comprobar los pasos con Jev.');

/** @type {import('../../../src/lib/retos/tipos').Comprobaciones} */
export default {
  soloAlEjecutar: true,
  pasos: [
    {
      titulo: 'La petición a Jev',
      archivo: 'jev.js',
      todo: 'TODO 1',
      pistas: [
        'La API del taller necesita saber quién llama: el token va en la cabecera `Authorization`, después de `Bearer `. Ya está importado de config.js como `TOKEN`.',
        'El cuerpo es el objeto `{ state, questions }` convertido en texto con `JSON.stringify`.',
      ],
      async comprobar({ importar, afirmar, ventana }) {
        const { preguntarAJev } = await importar('jev.js');
        const { TOKEN } = await importar('config.js');
        exigirToken(TOKEN, afirmar);

        await conFetchEspiado(ventana, async (peticiones) => {
          const answers = await preguntarAJev({ texto: 'hola' }, { spam: { type: 'noul', instructions: '¿Es spam?' } });

          afirmar(peticiones.length === 1, 'preguntarAJev no ha hecho ninguna petición con fetch.');
          const [peticion] = peticiones;
          afirmar(peticion.url.endsWith('/api/jev'), `La URL debería ser \`\${API_URL}/api/jev\` y es ${peticion.url}.`);
          afirmar(peticion.metodo === 'POST', `Jev se llama con method: 'POST' (ahora es ${peticion.metodo}).`);
          afirmar(
            peticion.cabeceras.authorization === `Bearer ${TOKEN}`,
            `La cabecera Authorization tiene que ser \`Bearer \${TOKEN}\` y es ${JSON.stringify(peticion.cabeceras.authorization)}.`,
          );
          afirmar(peticion.cabeceras['content-type']?.includes('application/json'), "Falta la cabecera 'Content-Type': 'application/json'.");
          afirmar(
            peticion.cuerpo?.state?.texto === 'hola' && peticion.cuerpo?.questions?.spam,
            'El cuerpo debería ser JSON.stringify({ state, questions }).',
          );
          afirmar(
            typeof answers?.spam?.noul === 'number',
            'Devuelve el campo `answers` del JSON que responde Jev.',
          );
        });
      },
    },
    {
      titulo: 'Búsqueda inteligente (score y criteria)',
      archivo: 'jev.js',
      todo: 'TODO 2',
      pistas: [
        'Para puntuar cada producto en una escala ordenada, el tipo de pregunta de Jev es `\'score\'`.',
        'La escala de niveles ya está definida justo encima en la constante `NIVELES`: pásala en `criteria: NIVELES`.',
      ],
      async comprobar({ importar, afirmar, ventana }) {
        const { busquedaInteligente } = await importar('jev.js');
        const { TOKEN } = await importar('config.js');
        exigirToken(TOKEN, afirmar);

        await conFetchEspiado(ventana, async (peticiones) => {
          let lista;
          let errorLlamada;
          try {
            lista = await busquedaInteligente('algo para grabar un pódcast');
          } catch (error) {
            errorLlamada = error;
          }

          afirmar(peticiones.length === 1, 'Todo el catálogo va en una sola llamada a Jev.');
          const preguntas = Object.values(peticiones[0].cuerpo?.questions ?? {});
          afirmar(preguntas.length > 0, 'Faltan las preguntas en `questions`.');
          afirmar(
            preguntas.every((q) => q?.type === 'score'),
            `Para puntuar cada producto en una escala, el tipo debe ser 'score' (ahora es ${JSON.stringify(preguntas[0]?.type)}).`,
          );
          afirmar(
            preguntas.every((q) => Array.isArray(q?.criteria) && q.criteria.length === 3),
            'El campo `criteria` debe ser la escala de niveles: `NIVELES`.',
          );

          if (errorLlamada) throw errorLlamada;

          const realAnswers = peticiones[0].respuesta?.answers;
          afirmar(realAnswers && typeof realAnswers === 'object', 'Jev no ha devuelto `answers`: revisa el paso 1.');
          afirmar(Array.isArray(lista) && lista.length > 0, 'Jev no ha devuelto productos recomendados para esta búsqueda.');
          afirmar(
            lista.every((item) => item?.producto?.id && typeof item.encaje === 'number' && !Number.isNaN(item.encaje)),
            'Cada elemento de la lista es { producto, encaje } con encaje numérico.',
          );
        });
      },
    },
    {
      titulo: 'Tipos de pregunta al moderar (noul y choice)',
      archivo: 'jev.js',
      todo: 'TODO 3',
      pistas: [
        'Una pregunta de sí o no (probabilidad de 0 a 1) en Jev es de tipo `\'noul\'`.',
        'Para elegir una opción entre las claves de `criteria`, el tipo es `\'choice\'`.',
      ],
      async comprobar({ importar, afirmar, ventana }) {
        const { moderarReseña } = await importar('jev.js');
        const { TOKEN } = await importar('config.js');
        exigirToken(TOKEN, afirmar);

        const producto = { id: 'mochila-viaje', nombre: 'Mochila de viaje 28 L' };
        await conFetchEspiado(ventana, async (peticiones) => {
          let errorLlamada;
          try {
            await moderarReseña('Cabe todo para un fin de semana y es muy cómoda', producto);
          } catch (error) {
            errorLlamada = error;
          }

          afirmar(peticiones.length === 1, 'moderarReseña debería hacer una sola llamada a Jev.');
          const qs = peticiones[0].cuerpo?.questions ?? {};
          afirmar(
            qs.inapropiada?.type === 'noul',
            `La pregunta inapropiada es de sí o no: type debe ser 'noul' (ahora es ${JSON.stringify(qs.inapropiada?.type)}).`,
          );
          afirmar(
            qs.tema?.type === 'choice',
            `La pregunta tema elige una opción de criteria: type debe ser 'choice' (ahora es ${JSON.stringify(qs.tema?.type)}).`,
          );

          if (errorLlamada) throw errorLlamada;

          const answers = peticiones[0].respuesta?.answers;
          afirmar(typeof answers?.inapropiada?.noul === 'number', 'Jev debería devolver `answers.inapropiada.noul`.');
          afirmar(typeof answers?.tema?.choice === 'string', 'Jev debería devolver `answers.tema.choice`.');
        });
      },
    },
    {
      titulo: 'Decidir con las respuestas',
      archivo: 'jev.js',
      todo: 'TODO 4',
      pistas: [
        'Tú eliges el umbral: con una probabilidad de «sí» mayor que `0.5`, la reseña es inapropiada (`answers.inapropiada.noul > 0.5`).',
        'Para las estrellas, redondea la puntuación y súmale 1: `Math.round(answers.nota.score) + 1`.',
      ],
      async comprobar({ importar, afirmar, ventana }) {
        const { moderarReseña } = await importar('jev.js');
        const { TOKEN } = await importar('config.js');
        exigirToken(TOKEN, afirmar);

        const producto = { id: 'mochila-viaje', nombre: 'Mochila de viaje 28 L' };

        const [spam, futbol, buena, notaReal] = await conFetchEspiado(ventana, async (peticiones) => {
          const resultados = await Promise.all([
            moderarReseña('GANA 5000 € DESDE CASA, HAZ CLIC AQUÍ http://spam.example', producto),
            moderarReseña('¡Qué partidazo el del domingo, menudo golazo en el minuto 90!', producto),
            moderarReseña('Cabe todo para un fin de semana y es muy cómoda', producto),
          ]);
          const peticionBuena = peticiones.find((p) => p.cuerpo?.state?.reseña?.includes('Cabe todo'));
          const scoreReal = peticionBuena?.respuesta?.answers?.nota?.score;
          return [...resultados, scoreReal];
        });

        afirmar(
          spam?.publicar === false && spam.motivo === 'contiene contenido inapropiado',
          'Una reseña con spam es inapropiada (answers.inapropiada.noul > 0.5) y no debería publicarse.',
        );
        afirmar(
          futbol?.publicar === false && futbol.motivo === 'no habla del producto',
          'Una reseña sobre fútbol no habla del producto y no debería publicarse (comprueba que inapropiada sea answers.inapropiada.noul > 0.5).',
        );
        afirmar(buena?.publicar === true, 'Una reseña normal sobre el producto sí se publica: { publicar: true, nota }.');
        afirmar(
          Number.isInteger(buena.nota) && buena.nota >= 1 && buena.nota <= 5,
          `Las estrellas tienen que ser un entero entre 1 y 5 (Math.round(answers.nota.score) + 1) y han salido ${buena.nota}.`,
        );
        if (typeof notaReal === 'number') {
          const estrellasEsperadas = Math.round(notaReal) + 1;
          afirmar(
            buena.nota === estrellasEsperadas,
            `Jev ha respondido nota.score = ${notaReal}: deberían salir ${estrellasEsperadas} estrellas (Math.round(answers.nota.score) + 1) y han salido ${buena.nota}.`,
          );
        }
      },
    },
  ],
};
