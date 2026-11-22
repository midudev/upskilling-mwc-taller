// Pasos del reto 1 y cómo se comprueba cada uno. En el iframe oculto corre el probador con tu server.js:
// las comprobaciones le hablan por MCP (window.__mcp) y miran la vista que ha montado.

const URI = 'ui://tienda/catalogo.html';

/** El documento de la vista que ha montado el probador con el resultado de buscar_productos */
const vista = ({ documento }) => documento.querySelector('iframe.vista')?.contentDocument;

/** @type {import('../../../src/lib/retos/tipos').Comprobaciones} */
export default {
  pasos: [
    {
      titulo: 'La herramienta apunta a su vista',
      archivo: 'server.js',
      todo: 'TODO 1',
      pistas: [
        'Una herramienta con interfaz lleva en `_meta.ui.resourceUri` la dirección `ui://` de su vista.',
        'Esa dirección ya está en una constante al principio de server.js: `VISTA_CATALOGO`.',
      ],
      async comprobar({ ventana, esperar, afirmar }) {
        const mcp = await esperar(() => ventana.__mcp, 'El probador no arranca: mira la consola.');
        const { tools } = await mcp('tools/list');
        const buscar = tools.find((tool) => tool.name === 'buscar_productos');
        afirmar(buscar, 'No está la herramienta buscar_productos.');
        afirmar(
          buscar._meta?.ui?.resourceUri === URI,
          `_meta.ui.resourceUri tiene que ser la dirección de la vista (VISTA_CATALOGO) y es ${JSON.stringify(buscar._meta?.ui?.resourceUri)}.`,
        );
      },
    },
    {
      titulo: 'Devuelve los datos para la vista',
      archivo: 'server.js',
      todo: 'TODO 2',
      pistas: [
        '`content` es lo que lee el modelo; `structuredContent`, los datos que recibe la vista para pintarse.',
        'Los productos ya están en la variable `productos`, y el carrito te lo da `verCarrito()`.',
      ],
      async comprobar({ ventana, esperar, afirmar }) {
        const mcp = await esperar(() => ventana.__mcp, 'El probador no arranca: mira la consola.');
        const resultado = await mcp('tools/call', { name: 'buscar_productos', arguments: { categoria: 'audio' } });
        afirmar(!resultado.isError, `buscar_productos ha fallado: ${resultado.content?.[0]?.text}`);
        const datos = resultado.structuredContent;
        afirmar(datos, 'Falta structuredContent en lo que devuelve la herramienta.');
        afirmar(Array.isArray(datos.productos) && datos.productos.length === 3, 'structuredContent.productos tienen que ser los productos encontrados (con categoría audio, 3).');
        afirmar(datos.carrito && 'unidades' in datos.carrito, 'structuredContent.carrito tiene que ser el carrito: verCarrito().');
      },
    },
    {
      titulo: 'El recurso ui:// con el HTML',
      archivo: 'server.js',
      todo: 'TODO 3',
      pistas: [
        'El cliente pide la vista con `resources/read` y la pinta en un iframe. Necesita saber que es un HTML de MCP Apps (su `mimeType`) y el HTML en sí (`text`).',
        'El mimeType está importado: `RESOURCE_MIME_TYPE`. El HTML te lo da `crearVista()` (devuelve una promesa: por eso el `await`).',
      ],
      async comprobar({ ventana, esperar, afirmar }) {
        const mcp = await esperar(() => ventana.__mcp, 'El probador no arranca: mira la consola.');
        let recurso;
        try {
          ({ contents: [recurso] = [] } = await mcp('resources/read', { uri: URI }));
        } catch (error) {
          throw new Error(`El cliente no puede leer ${URI}: ${error.message}`);
        }
        afirmar(recurso?.uri === URI, `El recurso tiene que devolver contents: [{ uri: VISTA_CATALOGO, … }].`);
        afirmar(
          recurso.mimeType === 'text/html;profile=mcp-app',
          `El mimeType tiene que ser RESOURCE_MIME_TYPE ('text/html;profile=mcp-app') y es ${JSON.stringify(recurso.mimeType)}.`,
        );
        afirmar(recurso.text?.includes('id="productos"'), 'El texto del recurso es el HTML de la vista: text: await crearVista().');
      },
    },
    {
      titulo: 'La vista pinta el resultado',
      archivo: 'vista/app.js',
      todo: 'TODO 4',
      pistas: [
        'La vista recibe el mismo resultado que la herramienta devuelve en server.js. Los datos van en una de sus propiedades.',
        'Es `resultado.structuredContent`: el `{ productos, carrito }` del TODO 2.',
      ],
      async comprobar(contexto) {
        await contexto.esperar(
          () => vista(contexto),
          'El probador no ha podido montar la vista: primero los TODO 1, 2 y 3 de server.js.',
          5000,
        );
        await contexto.esperar(
          () => vista(contexto).querySelectorAll('#productos li').length === 3,
          'La vista no pinta los productos: saca { productos, carrito } de resultado.structuredContent.',
          5000,
        );
        contexto.afirmar(
          /·\s*0\s*€/.test(vista(contexto).querySelector('#carrito')?.textContent ?? ''),
          'La vista no pinta el carrito: ¿llega carrito en structuredContent (TODO 2)?',
        );
      },
    },
    {
      titulo: 'El botón «Añadir» llama al servidor',
      archivo: 'vista/app.js',
      todo: 'TODO 5',
      pistas: [
        'La vista no habla con el servidor directamente: le pide al cliente que llame a una herramienta con `app.callServerTool({ name, arguments })`.',
        "El nombre es `'anadir_al_carrito'` (está en server.js) y el id del producto, `producto.id`.",
      ],
      async comprobar(contexto) {
        const { ventana, esperar } = contexto;
        const documentoVista = await esperar(
          () => vista(contexto)?.querySelector('#productos li button') && vista(contexto),
          'Antes, la vista tiene que pintar los productos (TODO 4).',
          5000,
        );
        documentoVista.querySelector('#productos li button').click();
        await esperar(
          () => ventana.__eventos.some((e) => e.metodo === 'tools/call' && e.detalle.startsWith('anadir_al_carrito')),
          "Al pulsar «Añadir», la vista debería llamar a la herramienta 'anadir_al_carrito' con app.callServerTool().",
        );
        await esperar(
          () => documentoVista.querySelector('#carrito')?.textContent.includes('· 1 ·'),
          'El carrito no se actualiza: ¿le pasas el id del producto (producto.id)?',
        );
      },
    },
  ],
};
