// La interfaz de la tienda: catálogo, carrito y ficha de cada producto. Ya funciona para personas.
// No hace falta tocarla: el main.js de cada reto la conecta con tu código a través de:
//   interfaz.abrirDetalle(id), interfaz.mostrarRecomendados(lista, texto), interfaz.ocultarRecomendados()
//   interfaz.estado(texto), interfaz.aviso(texto)
//   añadirAlBuscador($elemento), alAbrirFicha(fn), alPublicarReseña(fn)
import {
  añadirAlCarrito,
  añadirReseña,
  buscarProductos,
  categorias,
  filtrar,
  filtros,
  obtenerProducto,
  quitarDelCarrito,
  tienda,
  vaciarCarrito,
  verCarrito,
} from './tienda.js';

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const $filtros = $('#filtros');
const $productos = $('#productos');
const $estado = $('#estado');
const $lineas = $('#lineas');
const $total = $('#total');
const $detalle = $('#detalle');
const $contenido = $('#detalle-contenido');

export const euros = (cantidad) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cantidad);

/** Crea un elemento: h('p', { className: 'x' }, 'texto', otroElemento) */
export function h(etiqueta, propiedades = {}, ...hijos) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...hijos.filter((hijo) => hijo !== null && hijo !== undefined && hijo !== false));
  return $elemento;
}

/** Resultado de la última búsqueda especial: [{ producto, encaje }] o null */
let recomendados = null;

// ── Catálogo ──────────────────────────────────────────────────────────────

function pintarProductos() {
  const lista = recomendados ?? buscarProductos(filtros).map((producto) => ({ producto }));

  if (!recomendados) {
    $estado.textContent = `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;
  }

  $productos.replaceChildren(
    ...lista.map(({ producto, encaje }) =>
      h(
        'li',
        { className: 'producto' },
        h(
          'button',
          { type: 'button', className: 'foto', ariaLabel: `Ver ${producto.nombre}`, onclick: () => abrirDetalle(producto.id) },
          h('img', { src: producto.imagen, alt: '', width: 560, height: 560 }),
          encaje !== undefined && h('span', { className: 'encaje' }, `Encaje: ${Math.round(encaje * 100)} %`),
          h('span', { className: 'valoracion' }, `★ ${producto.valoracion}`),
        ),
        h('div', { className: 'titulo' }, h('h3', {}, producto.nombre), h('strong', {}, euros(producto.precio))),
        h('p', { className: 'descripcion' }, producto.descripcion),
        h('button', { type: 'button', className: 'añadir', onclick: () => añadirAlCarrito(producto.id) }, 'Añadir al carrito'),
      ),
    ),
  );
}

function pintarFiltros() {
  $filtros.texto.value = filtros.texto ?? '';
  $filtros.categoria.value = filtros.categoria ?? '';
  $filtros.precioMaximo.value = filtros.precioMaximo ?? '';
}

$filtros.addEventListener('input', () => {
  recomendados = null;
  filtrar({
    texto: $filtros.texto.value,
    categoria: $filtros.categoria.value,
    precioMaximo: Number($filtros.precioMaximo.value) || undefined,
  });
});

$filtros.addEventListener('submit', (evento) => evento.preventDefault());

/** Añade un formulario debajo de los filtros (la búsqueda inteligente, por significado…) */
export function añadirAlBuscador($elemento) {
  $('#buscador').append($elemento);
}

// ── Carrito ───────────────────────────────────────────────────────────────

function pintarCarrito() {
  const { lineas, total } = verCarrito();

  $lineas.replaceChildren(
    ...(lineas.length
      ? lineas.map((linea) =>
          h(
            'li',
            {},
            h('img', { src: linea.imagen, alt: '', width: 40, height: 40 }),
            h('span', {}, `${linea.cantidad} × ${linea.nombre}`),
            h('span', {}, euros(linea.subtotal)),
            h('button', { type: 'button', ariaLabel: `Quitar ${linea.nombre}`, onclick: () => quitarDelCarrito(linea.id) }, '×'),
          ),
        )
      : [h('li', { className: 'vacio' }, 'Todavía no hay nada.')]),
  );
  $total.textContent = euros(total);
}

$('#vaciar').addEventListener('click', () => vaciarCarrito());

// ── Ficha del producto ────────────────────────────────────────────────────

const alAbrir = [];
let moderar = async () => ({ publicar: true, nota: 3 }); // sin moderación, se publica todo

/** fn(producto, ficha) se llama cada vez que se abre una ficha. ficha.acciones(...$botones) añade botones */
export function alAbrirFicha(fn) {
  alAbrir.push(fn);
}

/** fn(texto, producto) decide si se publica una reseña: { publicar: true, nota } o { publicar: false, motivo } */
export function alPublicarReseña(fn) {
  moderar = fn;
}

function abrirDetalle(id) {
  const producto = obtenerProducto(id);

  const $reseñas = h(
    'ul',
    { className: 'reseñas' },
    ...producto.reseñas.map((reseña, indice) =>
      h(
        'li',
        { style: `--i: ${indice}` },
        h('p', { className: 'autor' }, `${reseña.autor} · ${'★'.repeat(reseña.nota)}`),
        h('p', { className: 'texto' }, reseña.texto),
      ),
    ),
  );
  const $acciones = h('div', { className: 'acciones' });
  const $resumen = h('div', { className: 'resumen', role: 'status' });

  const $aviso = h('p', { className: 'estado', role: 'status' });
  const $formulario = h(
    'form',
    { className: 'nueva-reseña' },
    h('label', {}, h('span', {}, 'Tu nombre'), h('input', { name: 'autor', required: true, autocomplete: 'off' })),
    h('label', {}, h('span', {}, 'Tu reseña'), h('textarea', { name: 'texto', rows: 3, required: true })),
    h('button', { type: 'submit' }, 'Publicar reseña'),
    $aviso,
  );

  $formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const $boton = $('button', $formulario);
    const autor = $formulario.autor.value.trim();
    const texto = $formulario.texto.value.trim();

    $boton.disabled = true;
    $aviso.textContent = 'Revisando la reseña…';
    try {
      const decision = await moderar(texto, producto);
      if (!decision.publicar) {
        $aviso.textContent = `No se ha publicado: ${decision.motivo}.`;
        return;
      }
      añadirReseña(producto.id, { autor, nota: decision.nota, texto });
      abrirDetalle(producto.id);
    } catch (error) {
      $aviso.textContent = error.message;
      console.error(error);
    } finally {
      $boton.disabled = false;
    }
  });

  const ficha = {
    $reseñas,
    $resumen,
    acciones: (...$elementos) => $acciones.append(...$elementos),
    resumir: (generar) => resumir($reseñas, $resumen, producto, generar),
  };
  for (const fn of alAbrir) fn(producto, ficha);

  $contenido.replaceChildren(
    h(
      'div',
      { className: 'ficha' },
      h('img', { src: producto.imagen, alt: '', width: 560, height: 560 }),
      h(
        'div',
        {},
        h('h2', {}, producto.nombre),
        h('p', { className: 'suave' }, producto.descripcion),
        h('p', { className: 'precio' }, h('strong', {}, euros(producto.precio)), h('span', {}, `★ ${producto.valoracion}`)),
      ),
    ),
    h('h3', {}, `Reseñas (${producto.reseñas.length})`),
    $acciones,
    $resumen,
    $reseñas,
    h('h3', {}, 'Escribe una reseña'),
    $formulario,
  );

  if (!$detalle.open) $detalle.showModal();
}

// ── Resumen de reseñas: las reseñas se funden en él mientras el modelo escribe ──

const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

/** generar({ alProgresar, alEscribir }) → { texto, motor } */
async function resumir($reseñas, $resumen, producto, generar) {
  restaurar($reseñas);
  $reseñas.classList.add('leyendo');
  $resumen.ariaBusy = 'true';
  $resumen.replaceChildren('Preparando el modelo…');

  // El modelo puede ir más rápido que la animación: se guarda lo generado y se escribe a su ritmo
  const salida = { texto: '', terminada: false };
  const $texto = h('p');
  let efecto;
  const fundirYEscribir = () =>
    (efecto ??= (async () => {
      $resumen.replaceChildren(`Resumiendo ${producto.reseñas.length} reseñas…`);
      await fundir($reseñas, $resumen);
      $resumen.replaceChildren($texto);
      await escribir($texto, salida);
    })());

  try {
    const { texto, motor } = await generar({
      alProgresar: (porcentaje) =>
        efecto ||
        $resumen.replaceChildren(
          porcentaje < 100 ? `Descargando el modelo… ${porcentaje} %` : 'Cargando el modelo…',
          h('progress', { max: 100, value: porcentaje }),
        ),
      alEscribir: (parcial) => {
        salida.texto = parcial.trimStart();
        fundirYEscribir();
      },
    });
    salida.texto = texto;
    salida.terminada = true;
    await fundirYEscribir();
    $resumen.append(h('small', {}, `— ${motor}`));
  } catch (error) {
    salida.terminada = true;
    await efecto?.catch(() => {});
    restaurar($reseñas);
    $resumen.replaceChildren(error.message);
    console.error(error);
  } finally {
    $reseñas.classList.remove('leyendo');
    $resumen.ariaBusy = 'false';
  }
}

/** Cada reseña vuela hasta el resumen y se disuelve dentro; después la lista vacía se pliega */
async function fundir($lista, $destino) {
  $lista.classList.remove('leyendo');
  if (menosMovimiento.matches) return;

  const destino = $destino.getBoundingClientRect();
  const vuelos = [...$lista.children].map(($reseña, indice) => {
    const origen = $reseña.getBoundingClientRect();
    const x = destino.x + destino.width / 2 - (origen.x + origen.width / 2);
    const y = destino.y + destino.height / 2 - (origen.y + origen.height / 2);
    return $reseña.animate(
      [
        { transform: 'none', opacity: 1, filter: 'blur(0)' },
        { opacity: 0.9, filter: 'blur(1px)', offset: 0.6 },
        { transform: `translate(${x}px, ${y}px) scale(0.2)`, opacity: 0, filter: 'blur(6px)' },
      ],
      { duration: 650, delay: indice * 90, easing: 'cubic-bezier(0.55, 0, 0.45, 1)', fill: 'forwards' },
    );
  });
  await Promise.all(vuelos.map((vuelo) => vuelo.finished));
  await $lista.animate([{ height: `${$lista.offsetHeight}px` }, { height: '0px' }], { duration: 250, easing: 'ease-in' })
    .finished;
  $lista.hidden = true;
}

function restaurar($lista) {
  for (const animacion of $lista.getAnimations({ subtree: true })) animacion.cancel();
  $lista.hidden = false;
}

/** Escribe el texto letra a letra según llega, hasta que el modelo termina */
async function escribir($elemento, salida) {
  $elemento.className = 'escribiendo';
  let letras = 0;
  while (!salida.terminada || letras < salida.texto.length) {
    letras = Math.min(letras + 1, salida.texto.length);
    $elemento.textContent = salida.texto.slice(0, letras);
    await new Promise(requestAnimationFrame);
  }
  $elemento.className = '';
}

// ── Lo que pueden usar los retos ──────────────────────────────────────────

export const interfaz = {
  /** Abre la ficha de un producto */
  abrirDetalle,
  /** Enseña una lista [{ producto, encaje }] en lugar del catálogo, con un texto en la línea de estado */
  mostrarRecomendados(lista, texto) {
    recomendados = lista;
    pintarProductos();
    $estado.textContent = texto;
  },
  /** Vuelve al catálogo normal */
  ocultarRecomendados() {
    recomendados = null;
    pintarProductos();
  },
  /** Cambia la línea de estado de debajo del buscador */
  estado(texto) {
    $estado.textContent = texto;
  },
  /** La etiqueta de la cabecera, por ejemplo «WebMCP: 4 herramientas» */
  aviso(texto) {
    const $aviso = $('#aviso');
    $aviso.textContent = texto;
    $aviso.hidden = !texto;
  },
};

// ── Arranque ──────────────────────────────────────────────────────────────

for (const categoria of categorias) {
  $filtros.categoria.append(h('option', { value: categoria }, categoria));
}

tienda.addEventListener('cambio', () => {
  pintarFiltros();
  pintarProductos();
  pintarCarrito();
});

pintarProductos();
pintarCarrito();
