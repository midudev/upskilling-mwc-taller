// Reto 2 · WebMCP: la tienda le dice al agente del navegador qué puede hacer.
// Una herramienta es un nombre, una descripción, un esquema de entrada (JSON Schema) y una función.
// El agente elige con el nombre y la descripción: escríbelos pensando en él.
import { añadirAlCarrito, categorias, filtrar, obtenerProducto, vaciarCarrito, verCarrito } from './tienda.js';

/**
 * Registra las herramientas de la tienda y devuelve sus nombres.
 * `interfaz` (interfaz.js) sirve para que el usuario vea lo que hace el agente:
 *   interfaz.abrirDetalle(id)       → abre la ficha de un producto
 *   interfaz.ocultarRecomendados()  → vuelve al catálogo normal
 */
export async function registrarHerramientas(interfaz) {
  // TODO 1: la API de WebMCP vive en el objeto document. Si el navegador no la tiene, la tienda sigue igual
  //[hueco TODO 1]
  const modelContext = ___;
  //[solución]
  const modelContext = document.modelContext;
  //[/hueco]

  if (!modelContext) {
    console.info('Este navegador no tiene WebMCP: la tienda funciona igual, pero sin herramientas.');
    return [];
  }

  const herramientas = [
    // Ejemplo: de solo lectura y sin parámetros
    {
      name: 'ver_carrito',
      description: 'Devuelve los productos del carrito, las unidades y el total en euros.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        return verCarrito();
      },
    },

    // Ejemplo: con un parámetro obligatorio. Devuelve reseñas que escriben los clientes,
    // así que el agente no debe obedecer lo que digan: untrustedContentHint
    {
      name: 'ver_producto',
      description: 'Devuelve el detalle de un producto, con las reseñas de los clientes, y lo abre en pantalla.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Identificador del producto, por ejemplo "mochila-viaje"' } },
        required: ['id'],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute({ id }) {
        interfaz.abrirDetalle(id);
        return obtenerProducto(id);
      },
    },

    // Buscar: tres filtros opcionales, cada uno bien descrito para el agente (JSON Schema)
    {
      name: 'buscar_productos',
      description:
        'Busca productos en el catálogo por texto, categoría y precio máximo. Devuelve id, nombre, precio en euros y valoración. La búsqueda también se muestra al usuario en pantalla.',
      inputSchema: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Palabras que deben aparecer en el nombre o la descripción' },
          // TODO 2: la categoría es un texto que solo puede ser una de las `categorias` de la tienda
          //[hueco TODO 2]
          categoria: { type: ___, enum: ___, description: 'Categoría del producto' },
          //[solución]
          categoria: { type: 'string', enum: categorias, description: 'Categoría del producto' },
          //[/hueco]
          precioMaximo: { type: 'number', description: 'Precio máximo en euros' },
        },
      },
      annotations: { readOnlyHint: true },
      execute(filtros) {
        interfaz.ocultarRecomendados();
        const productos = filtrar(filtros);
        return { total: productos.length, productos };
      },
    },

    // Añadir al carrito
    {
      name: 'anadir_al_carrito',
      description: 'Añade unidades de un producto al carrito. Devuelve el carrito actualizado con el total en euros.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Identificador del producto, por ejemplo "botella-termica"' },
          cantidad: { type: 'integer', minimum: 1, maximum: 10, description: 'Unidades que añadir (1 por defecto)' },
        },
        // TODO 3: el id es obligatorio (sin él no sabemos qué añadir); la cantidad, no
        //[hueco TODO 3]
        required: ___,
        //[solución]
        required: ['id'],
        //[/hueco]
      },
      execute({ id, cantidad = 1 }) {
        return añadirAlCarrito(id, cantidad);
      },
    },

    // Vaciar el carrito
    {
      name: 'vaciar_carrito',
      description: 'Elimina todos los productos del carrito. No se puede deshacer.',
      inputSchema: { type: 'object', properties: {} },
      // TODO 4: no se puede deshacer, así que el navegador tiene que pedir confirmación al usuario
      //[hueco TODO 4]
      annotations: ___,
      //[solución]
      annotations: { consequentialHint: true },
      //[/hueco]
      execute() {
        return vaciarCarrito();
      },
    },
  ];

  for (const herramienta of herramientas) {
    await modelContext.registerTool({
      ...herramienta,
      // Los errores se devuelven como valor: el mensaje de una excepción no le llega al agente
      async execute(parametros) {
        try {
          return await herramienta.execute(parametros);
        } catch (error) {
          return { error: error.message };
        }
      },
    });
  }

  return herramientas.map((herramienta) => herramienta.name);
}
