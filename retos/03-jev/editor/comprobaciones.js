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
      titulo: 'Búsqueda inteligente',
      archivo: 'jev.js',
      todo: 'TODO 2',
      pistas: [
        'Jev responde una puntuación por producto: `answers[producto.id].score`. Con 3 niveles, va de 0 a 2.',
        'Para que quede entre 0 y 1, divide entre el nivel más alto: `answers[producto.id].score / 2`.',
      ],
      async comprobar({ importar, afirmar, ventana }) {
        const { busquedaInteligente } = await importar('jev.js');
        const { TOKEN } = await importar('config.js');
        exigirToken(TOKEN, afirmar);

        await conFetchEspiado(ventana, async (peticiones) => {
          const lista = await busquedaInteligente('algo para grabar un pódcast');
          afirmar(peticiones.length === 1, 'Todo el catálogo va en una sola llamada a Jev.');

          const realAnswers = peticiones[0].respuesta?.answers;
          afirmar(realAnswers && typeof realAnswers === 'object', 'Jev no ha devuelto `answers`: revisa el paso 1.');
          afirmar(Array.isArray(lista), 'busquedaInteligente debería devolver una lista [{ producto, encaje }].');
          afirmar(
            lista.every((item) => item?.producto?.id && typeof item.encaje === 'number' && !Number.isNaN(item.encaje)),
            'Cada elemento de la lista es { producto, encaje } con encaje numérico.',
          );
          afirmar(
            lista.every((item) => item.encaje >= 0 && item.encaje <= 1),
            'encaje tiene que quedar entre 0 y 1: divide answers[producto.id].score entre 2.',
          );

          const esperados = Object.entries(realAnswers)
            .map(([id, resp]) => ({ id, encaje: resp.score / 2 }))
            .filter(({ encaje }) => encaje >= 0.5)
            .sort((a, b) => b.encaje - a.encaje);

          afirmar(esperados.length > 0, 'Jev no ha encontrado productos para esta búsqueda; vuelve a intentarlo.');
          afirmar(
            lista.length === esperados.length &&
              lista.every((item, i) => item.producto.id === esperados[i].id && Math.abs(item.encaje - esperados[i].encaje) < 1e-6),
            'encaje = answers[producto.id].score / 2 (entre 0 y 1). Solo pasan los que llegan a 0.5, ordenados de mayor a menor.',
          );
        });
      },
    },
    {
      titulo: 'Moderar reseñas',
      archivo: 'jev.js',
      todo: 'TODO 3',
      pistas: [
        'Tú eliges el umbral: con una probabilidad de «sí» mayor que `0.5`, la reseña es inapropiada.',
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
