// La tienda ya funciona para personas (interfaz.js). Aquí se conecta con tu runonweb.js.
// No hace falta tocar este archivo.
import { alAbrirFicha, añadirAlBuscador, h, interfaz } from './interfaz.js';
import { buscarPorSignificado, dictar, traducirReseñas } from './runonweb.js';
import { todosLosProductos } from './tienda.js';

const descargando = (porcentaje) => interfaz.estado(`Descargando el modelo… ${porcentaje} %`);

// ── Buscar por significado (y dictar la búsqueda) ─────────────────────────

const $peticion = h('input', { name: 'peticion', placeholder: 'algo para no oír a nadie en el tren', autocomplete: 'off', required: true });
const $dictar = h('button', { type: 'button', className: 'dictar', ariaPressed: 'false', title: 'Dictar la búsqueda' }, h('span', { ariaHidden: 'true' }, '● '), 'Dictar');
const $buscar = h('button', { type: 'submit' }, 'Buscar');
const $formulario = h(
  'form',
  { className: 'inteligente significado' },
  h('label', {}, h('span', {}, 'Buscar por significado ', h('small', {}, '· runonweb, en tu navegador')), $peticion),
  h('div', { className: 'botones' }, $dictar, $buscar),
);
añadirAlBuscador($formulario);

$formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const peticion = $peticion.value.trim();
  $buscar.disabled = true;
  interfaz.estado('Buscando en tu navegador…');
  const inicio = performance.now();

  try {
    const lista = await buscarPorSignificado(peticion, todosLosProductos(), { alProgresar: descargando });
    const milisegundos = Math.round(performance.now() - inicio);
    interfaz.mostrarRecomendados(lista, `Lo más parecido a «${peticion}» · ${milisegundos} ms, en local`);
  } catch (error) {
    interfaz.estado(error.message);
    console.error(error);
  } finally {
    $buscar.disabled = false;
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
    interfaz.estado(`No hay micrófono: ${error.message}`);
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
    interfaz.estado('Transcribiendo en tu navegador…');

    try {
      const texto = await dictar(new Blob(trozos, { type: trozos[0]?.type }), {
        alProgresar: descargando,
        alEscribir: (parcial) => ($peticion.value = parcial.trim()),
      });
      $peticion.value = texto;
      if (texto) $formulario.requestSubmit();
      else interfaz.estado('No se ha entendido nada. Prueba otra vez.');
    } catch (error) {
      interfaz.estado(error.message);
      console.error(error);
    } finally {
      $dictar.disabled = false;
    }
  });

  grabadora.start();
  $dictar.ariaPressed = 'true';
  interfaz.estado('Escuchando… pulsa «Dictar» otra vez para terminar');
});

// ── Traducir las reseñas, en la ficha de cada producto ────────────────────

alAbrirFicha((producto, ficha) => {
  const $traducir = h('button', { type: 'button' }, 'Traducir al inglés');
  const $aviso = h('p', { className: 'estado', role: 'status' });
  const originales = producto.reseñas.map((reseña) => reseña.texto);
  let enInglés = false;

  $traducir.addEventListener('click', async () => {
    const $textos = [...ficha.$reseñas.querySelectorAll('.texto')];
    if (enInglés) {
      $textos.forEach(($texto, indice) => ($texto.textContent = originales[indice]));
      enInglés = false;
      $traducir.textContent = 'Traducir al inglés';
      return;
    }

    $traducir.disabled = true;
    $aviso.textContent = 'Traduciendo en tu navegador…';
    try {
      const traducciones = await traducirReseñas(producto, {
        alProgresar: (porcentaje) => ($aviso.textContent = `Descargando el traductor… ${porcentaje} %`),
      });
      $textos.forEach(($texto, indice) => ($texto.textContent = traducciones[indice]));
      enInglés = true;
      $traducir.textContent = 'Ver en español';
      $aviso.textContent = '';
    } catch (error) {
      $aviso.textContent = error.message;
      console.error(error);
    } finally {
      $traducir.disabled = false;
    }
  });

  ficha.acciones($traducir, $aviso);
});
