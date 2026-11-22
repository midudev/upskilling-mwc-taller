// Código de la vista: se ejecuta dentro del iframe que muestra el cliente MCP.
import { App } from '@modelcontextprotocol/ext-apps';

const $productos = document.querySelector('#productos');
const $titulo = document.querySelector('#titulo');
const $carrito = document.querySelector('#carrito');
const $estado = document.querySelector('#estado');

const app = new App({ name: 'Catálogo de la tienda', version: '1.0.0' });

const euros = (cantidad) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cantidad);

function pintarProductos(productos) {
  $titulo.textContent = `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}`;
  $estado.textContent = productos.length === 0 ? 'No hay productos que coincidan con la búsqueda.' : '';

  $productos.replaceChildren(
    ...productos.map((producto) => {
      const $item = document.createElement('li');
      $item.className = 'producto';
      $item.innerHTML = `
        <span class="emoji" aria-hidden="true"></span>
        <span class="nombre"></span>
        <p class="descripcion"></p>
        <div class="pie">
          <span class="precio"></span>
          <button class="añadir" type="button">Añadir</button>
        </div>`;
      $item.querySelector('.emoji').textContent = producto.emoji;
      $item.querySelector('.nombre').textContent = producto.nombre;
      $item.querySelector('.descripcion').textContent = producto.descripcion;
      $item.querySelector('.precio').textContent = `${euros(producto.precio)} · ★ ${producto.valoracion}`;
      $item.querySelector('button').addEventListener('click', (evento) => añadir(producto, evento.currentTarget));
      return $item;
    }),
  );
}

function pintarCarrito(carrito) {
  $carrito.textContent = `Carrito · ${carrito.unidades} · ${euros(carrito.total)}`;
}

async function añadir(producto, $boton) {
  $boton.disabled = true;
  try {
    // TODO 5: la vista llama a otra herramienta del servidor (anadir_al_carrito) a través del cliente
    //[hueco TODO 5]
    const resultado = await app.callServerTool({ name: ___, arguments: { id: ___, cantidad: 1 } });
    //[solución]
    const resultado = await app.callServerTool({ name: 'anadir_al_carrito', arguments: { id: producto.id, cantidad: 1 } });
    //[/hueco]
    pintarCarrito(resultado.structuredContent);
    $estado.textContent = `${producto.nombre} añadido al carrito.`;

    // El modelo no ve la interfaz: le contamos lo que ha hecho el usuario
    await app.updateModelContext({
      content: [{ type: 'text', text: `El usuario ha añadido "${producto.nombre}" al carrito desde la interfaz.` }],
    });
  } catch (error) {
    $estado.textContent = `No se ha podido añadir: ${error.message}`;
  } finally {
    $boton.disabled = false;
  }
}

// El cliente nos envía el resultado de la herramienta que ha abierto esta vista
app.addEventListener('toolresult', (resultado) => {
  // TODO 4: los datos llegan en el structuredContent del resultado (los que devuelve server.js en el TODO 2)
  //[hueco TODO 4]
  const { productos, carrito } = ___;
  //[solución]
  const { productos, carrito } = resultado.structuredContent;
  //[/hueco]
  pintarProductos(productos);
  pintarCarrito(carrito);
});

// El botón del carrito le pide al asistente que continúe la conversación
$carrito.addEventListener('click', () => {
  app.sendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'Enséñame el carrito y dime el total.' }],
  });
});

// Conectamos con el cliente (siempre después de registrar los eventos)
await app.connect();
