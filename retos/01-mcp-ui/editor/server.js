// Reto 1 · MCP UI: el servidor MCP de la tienda. En tu máquina sería un proceso de Node; aquí se ejecuta
// en tu navegador y la pestaña Resultado es un cliente MCP (un probador) que habla con él.
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { crearVista } from './lib/vista.js'; // la carpeta vista/ (HTML + CSS + JS) empaquetada en un único HTML
import { categorias } from './productos.js';
import { añadirAlCarrito, buscarProductos, verCarrito } from './tienda.js';

// Dirección de la vista. El esquema ui:// indica que es una interfaz de MCP Apps
const VISTA_CATALOGO = 'ui://tienda/catalogo.html';

export function crearServidor() {
  const server = new McpServer({ name: 'tienda', version: '1.0.0' });

  // Una herramienta con interfaz: registerAppTool en vez de server.registerTool
  registerAppTool(
    server,
    'buscar_productos',
    {
      title: 'Buscar productos',
      description:
        'Busca productos en el catálogo de la tienda y los muestra en una interfaz interactiva con botón para añadir al carrito.',
      inputSchema: z.object({
        texto: z.string().optional().describe('Palabras que buscar en el nombre o la descripción'),
        categoria: z.enum(categorias).optional().describe('Categoría del producto'),
        precioMaximo: z.number().positive().optional().describe('Precio máximo en euros'),
      }),
      // TODO 1: la herramienta dice qué vista la muestra, con su dirección ui://
      //[hueco TODO 1]
      _meta: { ui: { resourceUri: ___ } },
      //[solución]
      _meta: { ui: { resourceUri: VISTA_CATALOGO } },
      //[/hueco]
    },
    async (filtros) => {
      const productos = buscarProductos(filtros);

      return {
        // Texto para el modelo (y para los clientes que no muestran interfaces)
        content: [
          {
            type: 'text',
            text: productos.length
              ? productos.map((p) => `- ${p.nombre} (${p.id}): ${p.precio} €, ★ ${p.valoracion}`).join('\n')
              : 'No hay productos que coincidan con la búsqueda.',
          },
        ],
        // TODO 2: los datos para la vista: los productos y el carrito (verCarrito())
        //[hueco TODO 2]
        structuredContent: { productos: ___, carrito: ___ },
        //[solución]
        structuredContent: { productos: productos, carrito: verCarrito() },
        //[/hueco]
      };
    },
  );

  // El recurso con el HTML de la interfaz: el cliente lo lee y lo pinta en un iframe
  registerAppResource(
    server,
    'Catálogo de la tienda',
    VISTA_CATALOGO,
    { description: 'Cuadrícula de productos con botón para añadir al carrito' },
    async () => ({
      contents: [
        // TODO 3: un HTML de MCP Apps (su mimeType es RESOURCE_MIME_TYPE) con el texto de la vista
        //[hueco TODO 3]
        { uri: VISTA_CATALOGO, mimeType: ___, text: await ___ },
        //[solución]
        { uri: VISTA_CATALOGO, mimeType: RESOURCE_MIME_TYPE, text: await crearVista() },
        //[/hueco]
      ],
    }),
  );

  // Una herramienta normal: la usa el modelo… y también la vista, con app.callServerTool()
  server.registerTool(
    'anadir_al_carrito',
    {
      title: 'Añadir al carrito',
      description: 'Añade un producto al carrito de la compra.',
      inputSchema: z.object({
        id: z.string().describe('Identificador del producto, por ejemplo "teclado-mecanico"'),
        cantidad: z.number().int().min(1).max(10).default(1).describe('Unidades que añadir'),
      }),
    },
    async ({ id, cantidad }) => {
      try {
        const carrito = añadirAlCarrito(id, cantidad);
        return {
          content: [{ type: 'text', text: `Añadido. El carrito tiene ${carrito.unidades} unidades: ${carrito.total} €.` }],
          structuredContent: carrito,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    },
  );

  return server;
}
