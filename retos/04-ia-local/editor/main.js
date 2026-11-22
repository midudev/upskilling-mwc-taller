// La tienda ya funciona para personas (interfaz.js). Aquí se conecta con tu ia-local.js.
// No hace falta tocar este archivo.
import { resumirReseñas } from './ia-local.js';
import { alAbrirFicha, h } from './interfaz.js';

// Un botón en la ficha de cada producto: abre uno y pulsa «Resumir reseñas en local»
alAbrirFicha((producto, ficha) => {
  const $resumir = h('button', { type: 'button' }, 'Resumir reseñas en local');

  $resumir.addEventListener('click', async () => {
    $resumir.disabled = true;
    // ficha.resumir pinta el progreso de la descarga y el resumen según se escribe
    await ficha.resumir(({ alProgresar, alEscribir }) => resumirReseñas(producto, { alProgresar, alEscribir }));
    $resumir.disabled = false;
  });

  ficha.acciones($resumir);
});
