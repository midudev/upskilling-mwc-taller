// La tienda ya funciona para personas (interfaz.js). Aquí se conecta con tus funciones de jev.js.
// No hace falta tocar este archivo.
import { alPublicarReseña, añadirAlBuscador, h, interfaz } from './interfaz.js';
import { busquedaInteligente, moderarReseña } from './jev.js';

// Búsqueda inteligente: un buscador más, debajo de los filtros
const $peticion = h('input', {
  name: 'peticion',
  placeholder: 'un regalo para alguien que teletrabaja, por menos de 60 €',
  autocomplete: 'off',
  required: true,
});
const $buscar = h('button', { type: 'submit' }, 'Buscar');
const $formulario = h(
  'form',
  { className: 'inteligente' },
  h('label', {}, h('span', {}, 'Búsqueda inteligente ', h('small', {}, '· Jev')), $peticion),
  $buscar,
);
añadirAlBuscador($formulario);

$formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const peticion = $peticion.value.trim();
  $buscar.disabled = true;
  interfaz.estado('Jev está decidiendo…');
  const inicio = performance.now();

  try {
    const recomendados = await busquedaInteligente(peticion);
    const milisegundos = Math.round(performance.now() - inicio);
    interfaz.mostrarRecomendados(recomendados, `${recomendados.length} recomendados para «${peticion}» · ${milisegundos} ms`);
  } catch (error) {
    interfaz.estado(error.message);
    console.error(error);
  } finally {
    $buscar.disabled = false;
  }
});

// Moderación: Jev decide antes de publicar una reseña (abre un producto y escribe una)
alPublicarReseña(moderarReseña);
