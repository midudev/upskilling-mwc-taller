// Pasos del reto 2 y cómo se comprueba cada uno. Se ejecutan en un iframe oculto con tu código recién
// cargado (ver src/lib/retos/comprobar.ts). Si una comprobación lanza un error, su mensaje es la pista.

/** La herramienta registrada con ese nombre, tal y como la ve un agente */
async function herramienta({ documento, afirmar }, nombre) {
  const herramientas = await documento.modelContext.getTools();
  const encontrada = herramientas.find((h) => h.name === nombre);
  afirmar(encontrada, `No hay ninguna herramienta "${nombre}". Las registradas: ${herramientas.map((h) => h.name).join(', ') || 'ninguna'}.`);
  return encontrada;
}

/** Ejecuta una herramienta como lo haría el agente. Si devuelve { error }, la comprobación falla con ese error */
async function ejecutar({ documento, afirmar }, tool, argumentos) {
  const resultado = await documento.modelContext.executeTool(tool, argumentos);
  afirmar(resultado !== undefined, `${tool.name} no devuelve nada: falta un return en execute.`);
  afirmar(!resultado?.error, `${tool.name}(${JSON.stringify(argumentos)}) ha devuelto un error: ${resultado?.error}`);
  return resultado;
}

/** @type {import('../../../src/lib/retos/tipos').Comprobaciones} */
export default {
  pasos: [
    {
      titulo: 'Detecta document.modelContext',
      archivo: 'webmcp.js',
      todo: 'TODO 1',
      pistas: [
        'WebMCP añade un objeto nuevo al `document`: con él la página registra sus herramientas.',
        'Se llama `modelContext`: `document.modelContext`. Si el navegador no lo tiene, vale undefined.',
      ],
      async comprobar({ documento, esperar }) {
        await esperar(
          async () => (await documento.modelContext.getTools()).length > 0,
          'Todavía no hay herramientas registradas: modelContext sigue siendo undefined.',
        );
      },
    },
    {
      titulo: 'buscar_productos: la categoría',
      archivo: 'webmcp.js',
      todo: 'TODO 2',
      pistas: [
        'Es JSON Schema, como en `texto` y `precioMaximo`: un `type` y, si solo valen unos valores concretos, un `enum` con la lista.',
        "El tipo es `'string'` y la lista de categorías ya está importada de tienda.js: `categorias`.",
      ],
      async comprobar(contexto) {
        const { afirmar } = contexto;
        const tool = await herramienta(contexto, 'buscar_productos');
        const propiedades = tool.inputSchema?.properties ?? {};
        for (const nombre of ['texto', 'categoria', 'precioMaximo']) {
          afirmar(propiedades[nombre], `Falta el parámetro "${nombre}" en inputSchema.properties.`);
          afirmar(propiedades[nombre].description, `Describe el parámetro "${nombre}": el agente lo necesita para rellenarlo bien.`);
        }
        afirmar(propiedades.categoria.type === 'string', `categoria es un texto: type: 'string' (ahora es ${JSON.stringify(propiedades.categoria.type)}).`);
        afirmar(propiedades.categoria.enum?.includes('audio'), 'categoria debería tener `enum: categorias` (las categorías de la tienda).');
        afirmar(['number', 'integer'].includes(propiedades.precioMaximo.type), 'precioMaximo debería ser de tipo "number".');
        afirmar(tool.annotations?.readOnlyHint, 'Solo lee: añade annotations: { readOnlyHint: true }.');

        const audio = await ejecutar(contexto, tool, { categoria: 'audio' });
        afirmar(Array.isArray(audio.productos), 'execute debería devolver { total, productos }.');
        afirmar(
          audio.productos.length === 3 && audio.productos.every((p) => p.categoria === 'audio'),
          `Con { categoria: "audio" } deberían salir los 3 productos de audio y han salido ${audio.productos.length}.`,
        );
        afirmar(audio.total === audio.productos.length, '`total` debería ser el número de productos que devuelves.');

        const baratos = await ejecutar(contexto, tool, { precioMaximo: 30 });
        afirmar(
          baratos.productos.length === 2 && baratos.productos.every((p) => p.precio <= 30),
          'Con { precioMaximo: 30 } deberían salir 2 productos: ¿le pasas los filtros a filtrar()?',
        );
      },
    },
    {
      titulo: 'anadir_al_carrito: el id es obligatorio',
      archivo: 'webmcp.js',
      todo: 'TODO 3',
      pistas: [
        'En JSON Schema, los parámetros obligatorios van en `required`: una lista con sus nombres.',
        "Solo el id: `['id']`. Mira cómo lo hace la herramienta de ejemplo `ver_producto`.",
      ],
      async comprobar(contexto) {
        const { afirmar } = contexto;
        const tool = await herramienta(contexto, 'anadir_al_carrito');
        const propiedades = tool.inputSchema?.properties ?? {};
        afirmar(propiedades.id, 'Falta el parámetro "id" en inputSchema.properties.');
        afirmar(propiedades.cantidad, 'Falta el parámetro "cantidad" en inputSchema.properties.');
        afirmar(tool.inputSchema.required?.includes('id'), 'El id es obligatorio: añade required: [\'id\'] al inputSchema.');
        afirmar(!tool.inputSchema.required?.includes('cantidad'), 'La cantidad es opcional: quítala de required.');

        const dos = await ejecutar(contexto, tool, { id: 'botella-termica', cantidad: 2 });
        afirmar(dos.unidades === 2, `Tras añadir 2 botellas, el carrito debería tener 2 unidades y tiene ${dos.unidades}. ¿Devuelves añadirAlCarrito(id, cantidad)?`);
        const una = await ejecutar(contexto, tool, { id: 'mochila-viaje' });
        afirmar(una.unidades === 3, 'Sin cantidad debería añadir 1 unidad (cantidad = 1 por defecto).');

        const fallo = await contexto.documento.modelContext.executeTool(tool, { id: 'no-existe' });
        afirmar(fallo?.error, 'Con un id que no existe, el agente debería recibir { error }.');
      },
    },
    {
      titulo: 'vaciar_carrito, con confirmación',
      archivo: 'webmcp.js',
      todo: 'TODO 4',
      pistas: [
        'Las `annotations` le cuentan al navegador cómo es la herramienta. `ver_carrito` lleva `readOnlyHint` porque solo lee.',
        'Para las que no se pueden deshacer: `{ consequentialHint: true }`. El navegador pide confirmación antes de ejecutarla.',
      ],
      async comprobar(contexto) {
        const { afirmar } = contexto;
        const tool = await herramienta(contexto, 'vaciar_carrito');
        afirmar(tool.annotations?.consequentialHint, 'No se puede deshacer: añade annotations: { consequentialHint: true }.');
        afirmar(!tool.annotations?.readOnlyHint, 'vaciar_carrito cambia el carrito: no es readOnlyHint.');
        const carrito = await ejecutar(contexto, tool, {});
        afirmar(carrito.unidades === 0, 'Después de vaciar, el carrito debería tener 0 unidades. ¿Devuelves vaciarCarrito()?');
      },
    },
  ],
};
