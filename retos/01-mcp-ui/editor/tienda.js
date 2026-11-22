// Lógica de la tienda: buscar productos y gestionar el carrito.
// No sabe nada de MCP: son funciones normales de JavaScript.
import { productos } from './productos.js';

/** Carrito en memoria: id del producto → cantidad */
const carrito = new Map();

const normalizar = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function buscarProductos({ texto = '', categoria, precioMaximo } = {}) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);

  return productos
    .filter((producto) => {
      const contenido = normalizar(`${producto.nombre} ${producto.descripcion} ${producto.categoria}`);
      if (!palabras.every((palabra) => contenido.includes(palabra))) return false;
      if (categoria && producto.categoria !== categoria) return false;
      if (precioMaximo !== undefined && producto.precio > precioMaximo) return false;
      return true;
    })
    .map(({ reseñas, ...producto }) => ({
      ...producto,
      valoracion: Number((reseñas.reduce((suma, { nota }) => suma + nota, 0) / reseñas.length).toFixed(1)),
    }));
}

export function añadirAlCarrito(id, cantidad = 1) {
  const producto = productos.find((producto) => producto.id === id);
  if (!producto) throw new Error(`No existe ningún producto con el id "${id}"`);

  carrito.set(id, (carrito.get(id) ?? 0) + cantidad);
  return verCarrito();
}

export function verCarrito() {
  const lineas = [...carrito].map(([id, cantidad]) => {
    const { nombre, precio, emoji } = productos.find((producto) => producto.id === id);
    return { id, nombre, emoji, precio, cantidad, subtotal: precio * cantidad };
  });

  return {
    lineas,
    unidades: lineas.reduce((suma, linea) => suma + linea.cantidad, 0),
    total: lineas.reduce((suma, linea) => suma + linea.subtotal, 0),
  };
}
