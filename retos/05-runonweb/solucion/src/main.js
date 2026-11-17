// Interfaz de la tienda. No hace falta tocar este archivo durante el taller:
// el trabajo de cada bloque está en webmcp.js, jev.js, ia-local.js y runonweb.js.
import { resumirReseñas } from './ia-local.js';
import { busquedaInteligente, moderarReseña } from './jev.js';
import { buscarPorSignificado, dictar, leerEnVozAlta, traducirReseñas } from './runonweb.js';
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
  todosLosProductos,
  vaciarCarrito,
  verCarrito,
} from './tienda.js';
import { registrarHerramientas } from './webmcp.js';

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const $filtros = $('#filtros');
const $inteligente = $('#inteligente');
const $significado = $('#significado');
const $dictar = $('#dictar');
const $productos = $('#productos');
const $estado = $('#estado');
const $lineas = $('#lineas');
const $total = $('#total');
const $detalle = $('#detalle');
const $contenido = $('#detalle-contenido');
const $ofertas = $('#ofertas');

const euros = (cantidad) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cantidad);

/** Crea un elemento: h('p', { className: 'x' }, 'texto', otroElemento) */
function h(etiqueta, propiedades = {}, ...hijos) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...hijos.filter((hijo) => hijo !== null && hijo !== undefined && hijo !== false));
  return $elemento;
}

/** Resultado de la última búsqueda inteligente: [{ producto, encaje }] o null */
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
        // La foto abre la ficha del producto
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

// ── Bloque 3 · Búsqueda inteligente con Jev ───────────────────────────────

$inteligente.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const $boton = $('button', $inteligente);
  const peticion = $inteligente.peticion.value.trim();

  $boton.disabled = true;
  $estado.textContent = 'Jev está decidiendo…';
  const inicio = performance.now();

  try {
    recomendados = await busquedaInteligente(peticion);
    const milisegundos = Math.round(performance.now() - inicio);
    $estado.textContent = `${recomendados.length} recomendados para «${peticion}» · ${milisegundos} ms`;
    pintarProductos();
  } catch (error) {
    $estado.textContent = error.message;
  } finally {
    $boton.disabled = false;
  }
});

// ── Reto 5 · Buscar por significado y dictar con runonweb ─────────────────

const descargando = (porcentaje) => ($estado.textContent = `Descargando el modelo… ${porcentaje} %`);

$significado.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const $boton = $('button[type="submit"]', $significado);
  const peticion = $significado.peticion.value.trim();

  $boton.disabled = true;
  $estado.textContent = 'Buscando en tu navegador…';
  const inicio = performance.now();

  try {
    recomendados = await buscarPorSignificado(peticion, todosLosProductos(), { alProgresar: descargando });
    const milisegundos = Math.round(performance.now() - inicio);
    $estado.textContent = `Lo más parecido a «${peticion}» · ${milisegundos} ms, en local`;
    pintarProductos();
  } catch (error) {
    $estado.textContent = error.message;
  } finally {
    $boton.disabled = false;
  }
});

// Primer clic: graba con el micrófono. Segundo clic: para, transcribe y busca
let grabadora = null;

$dictar.addEventListener('click', async () => {
  if (grabadora) {
    grabadora.stop();
    return;
  }

  let microfono;
  try {
    microfono = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    $estado.textContent = `No hay micrófono: ${error.message}`;
    return;
  }

  const trozos = [];
  grabadora = new MediaRecorder(microfono);
  grabadora.addEventListener('dataavailable', (evento) => trozos.push(evento.data));
  grabadora.addEventListener('stop', async () => {
    for (const pista of microfono.getTracks()) pista.stop();
    grabadora = null;
    $dictar.ariaPressed = 'false';
    $dictar.disabled = true;
    $estado.textContent = 'Transcribiendo en tu navegador…';

    try {
      const texto = await dictar(new Blob(trozos, { type: trozos[0]?.type }), {
        alProgresar: descargando,
        alEscribir: (parcial) => ($significado.peticion.value = parcial.trim()),
      });
      $significado.peticion.value = texto;
      if (texto) $significado.requestSubmit();
      else $estado.textContent = 'No se ha entendido nada. Prueba otra vez.';
    } catch (error) {
      $estado.textContent = error.message;
    } finally {
      $dictar.disabled = false;
    }
  });

  grabadora.start();
  $dictar.ariaPressed = 'true';
  $estado.textContent = 'Escuchando… pulsa «Dictar» otra vez para terminar';
});

// ── Detalle del producto: reseñas, resumen local y moderación ─────────────

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
        h('p', {}, reseña.texto),
      ),
    ),
  );
  const $resumen = h('div', { className: 'resumen', role: 'status' });
  const $resumir = h('button', { type: 'button' }, 'Resumir reseñas en local');
  const $verReseñas = h(
    'button',
    { type: 'button', className: 'ver-reseñas', hidden: true },
    `Ver las ${producto.reseñas.length} reseñas`,
  );

  // Bloque 4 · IA en el navegador: las reseñas se funden en un resumen hecho en el dispositivo
  $resumir.addEventListener('click', async () => {
    $resumir.disabled = true;
    $verReseñas.hidden = true;
    restaurarReseñas($reseñas);
    $reseñas.classList.add('leyendo');
    $resumen.ariaBusy = 'true';
    $resumen.replaceChildren('Preparando el modelo…');

    // El modelo puede ir más rápido que la animación: guardamos lo generado y lo escribimos a nuestro ritmo
    const salida = { texto: '', terminada: false };
    const $texto = h('p');
    let efecto;
    const fundirYEscribir = () =>
      (efecto ??= (async () => {
        $resumen.replaceChildren(`Resumiendo ${producto.reseñas.length} reseñas…`);
        await fundirReseñas($reseñas, $resumen);
        $resumen.replaceChildren($texto);
        await escribir($texto, salida);
      })());

    try {
      const { texto, motor } = await resumirReseñas(producto, {
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
      $verReseñas.hidden = !$reseñas.hidden;
    } catch (error) {
      salida.terminada = true;
      await efecto?.catch(() => {});
      restaurarReseñas($reseñas);
      $resumen.replaceChildren(error.message);
    } finally {
      $reseñas.classList.remove('leyendo');
      $resumen.ariaBusy = 'false';
      $resumir.disabled = false;
    }
  });

  $verReseñas.addEventListener('click', () => {
    $verReseñas.hidden = true;
    separarReseñas($reseñas);
  });

  // Reto 5 · runonweb: traducir las reseñas y escuchar el resumen (o la descripción), en local
  const $avisoLocal = h('p', { className: 'estado', role: 'status' });
  const $traducir = h('button', { type: 'button' }, 'Traducir al inglés');
  const $escuchar = h('button', { type: 'button' }, 'Escuchar ▸');
  const $audio = h('audio', { controls: true, hidden: true });
  const originales = producto.reseñas.map((reseña) => reseña.texto);
  let enInglés = false;

  $traducir.addEventListener('click', async () => {
    const $textos = [...$reseñas.children].map(($reseña) => $reseña.lastElementChild);
    if (enInglés) {
      $textos.forEach(($texto, indice) => ($texto.textContent = originales[indice]));
      enInglés = false;
      $traducir.textContent = 'Traducir al inglés';
      return;
    }

    $traducir.disabled = true;
    $avisoLocal.textContent = 'Traduciendo en tu navegador…';
    try {
      const traducciones = await traducirReseñas(producto, {
        alProgresar: (porcentaje) => ($avisoLocal.textContent = `Descargando el traductor… ${porcentaje} %`),
      });
      $textos.forEach(($texto, indice) => ($texto.textContent = traducciones[indice]));
      enInglés = true;
      $traducir.textContent = 'Ver en español';
      $avisoLocal.textContent = '';
    } catch (error) {
      $avisoLocal.textContent = error.message;
    } finally {
      $traducir.disabled = false;
    }
  });

  $escuchar.addEventListener('click', async () => {
    const texto = $resumen.querySelector('p')?.textContent.trim() || `${producto.nombre}. ${producto.descripcion}`;
    $escuchar.disabled = true;
    $avisoLocal.textContent = 'Poniendo voz en tu navegador…';
    try {
      const wav = await leerEnVozAlta(texto, {
        alProgresar: (porcentaje) => ($avisoLocal.textContent = `Descargando la voz… ${porcentaje} %`),
      });
      URL.revokeObjectURL($audio.src);
      $audio.src = URL.createObjectURL(wav);
      $audio.hidden = false;
      $audio.play().catch(() => {});
      $avisoLocal.textContent = '';
    } catch (error) {
      $avisoLocal.textContent = error.message;
    } finally {
      $escuchar.disabled = false;
    }
  });

  const $aviso = h('p', { className: 'estado', role: 'status' });
  const $formulario = h(
    'form',
    { className: 'nueva-reseña' },
    h('label', {}, h('span', {}, 'Tu nombre'), h('input', { name: 'autor', required: true, autocomplete: 'off' })),
    h('label', {}, h('span', {}, 'Tu reseña'), h('textarea', { name: 'texto', rows: 3, required: true })),
    h('button', { type: 'submit' }, 'Publicar reseña'),
    $aviso,
  );

  // Bloque 3 · Jev decide si la reseña se publica
  $formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const $boton = $('button', $formulario);
    const autor = $formulario.autor.value.trim();
    const texto = $formulario.texto.value.trim();

    $boton.disabled = true;
    $aviso.textContent = 'Revisando la reseña…';
    try {
      const decision = await moderarReseña(texto, producto);
      if (!decision.publicar) {
        $aviso.textContent = `No se ha publicado: ${decision.motivo}.`;
        return;
      }
      añadirReseña(producto.id, { autor, nota: decision.nota, texto });
      abrirDetalle(producto.id);
    } catch (error) {
      $aviso.textContent = error.message;
    } finally {
      $boton.disabled = false;
    }
  });

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
    h('div', { className: 'acciones-locales' }, $resumir, $traducir, $escuchar, $avisoLocal, $audio),
    $resumen,
    $verReseñas,
    $reseñas,
    h('h3', {}, 'Escribe una reseña'),
    $formulario,
  );

  if (!$detalle.open) $detalle.showModal();
}

// ── Efecto del resumen: las reseñas se funden en él ───────────────────────

const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

/** Cada reseña vuela hasta el resumen y se disuelve dentro; después la lista vacía se pliega */
async function fundirReseñas($lista, $destino) {
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

  $destino.animate([{ boxShadow: '0 0 0 0 rgb(255 59 48 / 0.5)' }, { boxShadow: '0 0 0 12px rgb(255 59 48 / 0)' }], {
    duration: 600,
    easing: 'ease-out',
  });
  await $lista.animate([{ height: `${$lista.offsetHeight}px` }, { height: '0px' }], { duration: 250, easing: 'ease-in' })
    .finished;
  $lista.hidden = true;
}

/** Lo contrario: las reseñas salen del resumen y vuelven a su sitio */
async function separarReseñas($lista) {
  const vuelos = $lista.getAnimations({ subtree: true });
  $lista.hidden = false;
  $lista.animate([{ height: '0px' }, { height: `${$lista.offsetHeight}px` }], { duration: 250, easing: 'ease-out' });
  for (const vuelo of vuelos) vuelo.reverse();
  await Promise.all(vuelos.map((vuelo) => vuelo.finished));
  restaurarReseñas($lista);
}

function restaurarReseñas($lista) {
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

// ── Ofertas (formulario que también se expone a los agentes) ──────────────

$ofertas.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const mensaje = `Te avisaremos en ${$ofertas.email.value} de las ofertas de ${$ofertas.categoria.value}.`;
  $('#ofertas-estado').textContent = mensaje;

  // WebMCP: si el formulario lo ha enviado un agente, le devolvemos el resultado
  if (evento.agentInvoked) evento.respondWith(Promise.resolve(mensaje));
});

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

// Bloque 2 · WebMCP
const herramientas = await registrarHerramientas({
  abrirDetalle,
  mostrarRecomendados(lista, peticion) {
    recomendados = lista;
    $estado.textContent = `${lista.length} recomendados para «${peticion}» (búsqueda de un agente)`;
    pintarProductos();
  },
  ocultarRecomendados() {
    recomendados = null;
  },
});

const $agente = $('#agente');
$agente.hidden = false;
$agente.textContent = herramientas.length
  ? `WebMCP: ${herramientas.length} herramientas expuestas`
  : 'WebMCP: sin herramientas';
