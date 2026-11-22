// Pasos del reto 3 y cómo se comprueba cada uno. Las comprobaciones no llaman a Jev de verdad:
// cambian fetch por uno falso que apunta la petición y responde con datos inventados.
// Así toda la sala puede comprobar a la vez sin gastar el límite de peticiones de la API.

/** Responde como Jev: { answers } con una respuesta por pregunta */
const comoJev = (responder) => ({ cuerpo }) => ({
  answers: Object.fromEntries(Object.keys(cuerpo?.questions ?? {}).map((nombre) => [nombre, responder(nombre)])),
});

const debeFallar = (promesa, mensaje) =>
  promesa.then(
    () => {
      throw new Error(mensaje);
    },
    () => {},
  );

/** @type {import('../../../src/lib/retos/tipos').Comprobaciones} */
export default {
  pasos: [
    {
      titulo: 'La petición a Jev',
      archivo: 'jev.js',
      todo: 'TODO 1',
      pistas: [
        'La API del taller necesita saber quién llama: el token va en la cabecera `Authorization`, después de `Bearer `. Ya está importado de config.js como `TOKEN`.',
        'El cuerpo es el objeto `{ state, questions }` convertido en texto con `JSON.stringify`.',
      ],
      async comprobar({ importar, fetchFalso, afirmar, ventana }) {
        const { preguntarAJev } = await importar('jev.js');
        const { TOKEN } = await importar('config.js');

        const peticiones = fetchFalso(() => ({ answers: { spam: { noul: 0.12 } } }));
        const answers = await preguntarAJev({ texto: 'hola' }, { spam: { type: 'noul', instructions: '¿Es spam?' } });

        afirmar(peticiones.length === 1, 'preguntarAJev no ha hecho ninguna petición con fetch.');
        const [peticion] = peticiones;
        afirmar(peticion.url.endsWith('/api/jev'), `La URL debería ser \`\${API_URL}/api/jev\` y es ${peticion.url}.`);
        afirmar(peticion.metodo === 'POST', `Jev se llama con method: 'POST' (ahora es ${peticion.metodo}).`);
        afirmar(peticion.cabeceras.authorization === `Bearer ${TOKEN}`, `La cabecera Authorization tiene que ser \`Bearer \${TOKEN}\` y es ${JSON.stringify(peticion.cabeceras.authorization)}.`);
        afirmar(peticion.cabeceras['content-type']?.includes('application/json'), "Falta la cabecera 'Content-Type': 'application/json'.");
        afirmar(
          peticion.cuerpo?.state?.texto === 'hola' && peticion.cuerpo?.questions?.spam,
          'El cuerpo debería ser JSON.stringify({ state, questions }).',
        );
        afirmar(answers?.spam?.noul === 0.12, 'Devuelve el campo `answers` del JSON de la respuesta.');

        fetchFalso(() => new ventana.Response(JSON.stringify({ error: { message: 'Token no válido' } }), { status: 401 }));
        await debeFallar(
          preguntarAJev({}, {}),
          'Si Jev responde con un error (un 401, por ejemplo), preguntarAJev debería lanzar un Error: mira respuesta.ok.',
        );
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
      async comprobar({ importar, fetchFalso, afirmar }) {
        const { busquedaInteligente } = await importar('jev.js');
        const puntuaciones = { 'auriculares-anc': 2, 'microfono-usb': 1.4, 'altavoz-bluetooth': 1 };
        const peticiones = fetchFalso(comoJev((id) => ({ score: puntuaciones[id] ?? 0.4 })));

        const lista = await busquedaInteligente('algo para grabar un pódcast');
        afirmar(peticiones.length === 1, 'Todo el catálogo va en una sola llamada a Jev.');
        afirmar(Array.isArray(lista), 'busquedaInteligente debería devolver una lista [{ producto, encaje }].');
        afirmar(
          lista.every((item) => item?.producto?.id && typeof item.encaje === 'number'),
          'Cada elemento de la lista es { producto, encaje }.',
        );
        const primero = lista.find((item) => item.producto.id === 'auriculares-anc');
        afirmar(primero?.encaje === 1, 'encaje = score / 2: un score de 2 es un encaje de 1.');
        afirmar(
          lista.length === 3,
          `Solo pasan los que llegan a 0.5: deberían quedar 3 y quedan ${lista.length}.`,
        );
        afirmar(
          lista.map((item) => item.producto.id).join() === 'auriculares-anc,microfono-usb,altavoz-bluetooth',
          'Ordénalos de mayor a menor encaje (sort).',
        );
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
      async comprobar({ importar, fetchFalso, afirmar }) {
        const { moderarReseña } = await importar('jev.js');
        const producto = { id: 'mochila-viaje', nombre: 'Mochila de viaje' };
        const responder = (respuestas) => fetchFalso(comoJev((nombre) => respuestas[nombre]));
        const tema = (choice, confidence) => ({ choice, confidence });

        responder({ inapropiada: { noul: 0.93 }, tema: tema('producto', 0.9), nota: { score: 4 } });
        const spam = await moderarReseña('GANA DINERO DESDE CASA', producto);
        afirmar(spam?.publicar === false && spam.motivo, 'Con inapropiada.noul = 0.93 (93 % de que sí) la reseña es inapropiada: `inapropiada` tiene que ser true.');

        responder({ inapropiada: { noul: 0.04 }, tema: tema('otro', 0.88), nota: { score: 2 } });
        const futbol = await moderarReseña('¡Qué partidazo el del domingo!', producto);
        afirmar(futbol?.publicar === false && futbol.motivo, "Si tema.choice es 'otro' con confidence 0.88, no se publica.");

        responder({ inapropiada: { noul: 0.4 }, tema: tema('otro', 0.45), nota: { score: 2.2 } });
        const dudosa = await moderarReseña('Bueno, no sé', producto);
        afirmar(dudosa?.publicar === true, "Con noul = 0.4 y 'otro' poco seguro (0.45) sí se publica: tú eliges los umbrales.");

        responder({ inapropiada: { noul: 0.02 }, tema: tema('producto', 0.97), nota: { score: 3.4 } });
        const buena = await moderarReseña('Cabe todo y es muy cómoda', producto);
        afirmar(buena?.publicar === true, 'Una reseña normal se publica: { publicar: true, nota }.');
        afirmar(buena.nota === 4, `Con nota.score = 3.4 deberían salir 4 estrellas (redondeado, más 1) y han salido ${buena.nota}.`);
      },
    },
  ],
};
