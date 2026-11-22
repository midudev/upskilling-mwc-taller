// Estado y lógica de la tienda. No sabe nada de la interfaz ni de IA:
// la interfaz (interfaz.js) y el código de cada reto usan estas funciones.
import { categorias, productos } from './productos.js';

export { categorias };

/** Avisa a la interfaz cuando cambia algo: tienda.addEventListener('cambio', …) */
export const tienda = new EventTarget();
const avisar = () => tienda.dispatchEvent(new Event('cambio'));

/** id del producto → cantidad. En memoria: cada vez que ejecutas, el carrito empieza vacío */
const carrito = new Map();

/** Filtros que se ven ahora mismo en pantalla */
export let filtros = { texto: '', categoria: '', precioMaximo: undefined };

const normalizar = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const valoracion = (producto) =>
  Number((producto.reseñas.reduce((suma, { nota }) => suma + nota, 0) / producto.reseñas.length).toFixed(1));

/** Datos de un producto sin las reseñas, listos para enseñar o enviar a un agente */
const resumen = ({ reseñas, ...producto }) => ({ ...producto, valoracion: valoracion({ reseñas }) });

/** Busca en el catálogo. Devuelve los productos sin reseñas: { id, nombre, precio, categoria, valoracion… } */
export function buscarProductos({ texto = '', categoria = '', precioMaximo } = {}) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);

  return productos
    .filter((producto) => {
      const contenido = normalizar(`${producto.nombre} ${producto.descripcion} ${producto.categoria}`);
      if (!palabras.every((palabra) => contenido.includes(palabra))) return false;
      if (categoria && producto.categoria !== categoria) return false;
      if (precioMaximo && producto.precio > precioMaximo) return false;
      return true;
    })
    .map(resumen);
}

/** Como buscarProductos, pero además cambia los filtros de la pantalla: el usuario ve lo que se busca */
export function filtrar(nuevos = {}) {
  filtros = { texto: '', categoria: '', precioMaximo: undefined, ...nuevos };
  avisar();
  return buscarProductos(filtros);
}

/** Un producto con sus reseñas. Lanza un error si no existe */
export function obtenerProducto(id) {
  const producto = productos.find((producto) => producto.id === id);
  if (!producto) throw new Error(`No existe ningún producto con el id "${id}"`);
  return { ...producto, valoracion: valoracion(producto) };
}

export function todosLosProductos() {
  return productos.map(resumen);
}

export function añadirReseña(id, reseña) {
  productos.find((producto) => producto.id === id).reseñas.push(reseña);
  avisar();
}

/** Añade unidades al carrito. Devuelve el carrito actualizado */
export function añadirAlCarrito(id, cantidad = 1) {
  obtenerProducto(id); // lanza un error si no existe
  carrito.set(id, (carrito.get(id) ?? 0) + cantidad);
  avisar();
  return verCarrito();
}

export function quitarDelCarrito(id) {
  carrito.delete(id);
  avisar();
  return verCarrito();
}

export function vaciarCarrito() {
  carrito.clear();
  avisar();
  return verCarrito();
}

/** { lineas: [{ id, nombre, precio, cantidad, subtotal }], unidades, total } */
export function verCarrito() {
  const lineas = [...carrito].map(([id, cantidad]) => {
    const { nombre, precio, imagen } = obtenerProducto(id);
    return { id, nombre, imagen, precio, cantidad, subtotal: precio * cantidad };
  });

  return {
    lineas,
    unidades: lineas.reduce((suma, linea) => suma + linea.cantidad, 0),
    total: lineas.reduce((suma, linea) => suma + linea.subtotal, 0),
  };
}
