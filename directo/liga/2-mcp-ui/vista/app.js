// Código de la vista: se ejecuta dentro del iframe que muestra el cliente MCP.
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';

const $contenido = document.querySelector('#contenido');
const $temporada = document.querySelector('#temporada');
const $pestañas = document.querySelectorAll('[data-herramienta]');

const app = new App({ name: 'LaLiga', version: '1.0.0' });

/* ───────────── HTML seguro: los textos que vienen de la API siempre se escapan ───────────── */

class Html {
  constructor(texto) {
    this.texto = texto;
  }
}

const escapar = (valor) => String(valor).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const convertir = (valor) =>
  valor == null || valor === false
    ? ''
    : valor instanceof Html
      ? valor.texto
      : Array.isArray(valor)
        ? valor.map(convertir).join('')
        : escapar(valor);

const html = (partes, ...valores) =>
  new Html(partes.reduce((resultado, parte, i) => resultado + parte + convertir(valores[i]), ''));

const mostrar = (contenido) => {
  $contenido.innerHTML = contenido.texto;
};

/* ───────────── Formato ───────────── */

const zonaHoraria = 'Europe/Madrid';
const dia = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zonaHoraria });
const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria });

const diferencia = ({ golesAFavor, golesEnContra }) => {
  const dg = golesAFavor - golesEnContra;
  return dg > 0 ? `+${dg}` : String(dg);
};

const RESULTADOS = { G: 'Ganado', E: 'Empatado', P: 'Perdido' };

/* ───────────── Piezas ───────────── */

const escudo = (url, tamaño = 20) =>
  url
    ? html`<img class="escudo" src="${url}" alt="" width="${tamaño}" height="${tamaño}" loading="lazy" />`
    : html`<span class="escudo" style="width:${tamaño}px;height:${tamaño}px"></span>`;

const botonEquipo = (equipo) =>
  html`<button type="button" class="equipo" data-equipo="${equipo.nombre}" title="Ver la ficha de ${equipo.nombre}">
    ${escudo(equipo.escudo)}<span class="nombre">${equipo.nombre}</span>
  </button>`;

function filaPartido(partido) {
  const { local, visitante, estado } = partido;
  const jugado = estado !== 'pre';
  const clase = (a, b) => (jugado && a.goles > b.goles ? 'gana' : jugado && a.goles < b.goles ? 'pierde' : '');

  return html`
    <li class="partido" data-estado="${estado}">
      <span class="lado local ${clase(local, visitante)}">${botonEquipo(local)}</span>
      <span class="marcador">
        ${jugado ? html`${local.goles}<span aria-hidden="true">-</span>${visitante.goles}` : hora(partido.fecha)}
      </span>
      <span class="lado visitante ${clase(visitante, local)}">${botonEquipo(visitante)}</span>
      ${estado === 'in' ? html`<span class="en-juego">En juego</span>` : ''}
    </li>`;
}

/* ───────────── Vistas ───────────── */

function pintarClasificacion({ temporada, equipos }) {
  $temporada.textContent = `LaLiga · ${temporada}`;
  const zonas = [...new Set(equipos.map((equipo) => equipo.zona).filter(Boolean))];

  mostrar(html`
    <table class="tabla">
      <thead>
        <tr>
          <th scope="col" class="num">#</th>
          <th scope="col">Equipo</th>
          <th scope="col" class="num" title="Partidos jugados">PJ</th>
          <th scope="col" class="num opcional" title="Ganados">G</th>
          <th scope="col" class="num opcional" title="Empatados">E</th>
          <th scope="col" class="num opcional" title="Perdidos">P</th>
          <th scope="col" class="num" title="Diferencia de goles">DG</th>
          <th scope="col" class="num">Pts</th>
        </tr>
      </thead>
      <tbody>
        ${equipos.map(
          (equipo) => html`
            <tr data-zona="${equipo.zona ?? ''}">
              <td class="num posicion">${equipo.posicion}</td>
              <td>${botonEquipo(equipo)}</td>
              <td class="num">${equipo.jugados}</td>
              <td class="num opcional">${equipo.ganados}</td>
              <td class="num opcional">${equipo.empatados}</td>
              <td class="num opcional">${equipo.perdidos}</td>
              <td class="num">${diferencia(equipo)}</td>
              <td class="num puntos">${equipo.puntos}</td>
            </tr>`,
        )}
      </tbody>
    </table>
    <ul class="leyenda">
      ${zonas.map((zona) => html`<li data-zona="${zona}">${zona}</li>`)}
    </ul>`);
}

function pintarResultados({ temporada, partidos }) {
  $temporada.textContent = `LaLiga · ${temporada}`;
  const porDia = Map.groupBy(partidos, (partido) => dia(partido.fecha));

  mostrar(html`
    <h1>Última jornada</h1>
    ${[...porDia].map(
      ([nombreDia, partidosDelDia]) => html`
        <section class="dia">
          <h2>${nombreDia}</h2>
          <ul class="partidos">${partidosDelDia.map(filaPartido)}</ul>
        </section>`,
    )}`);
}

function pintarEquipo(equipo) {
  const { proximo } = equipo;
  const rival = proximo && (proximo.local.id === equipo.id ? proximo.visitante : proximo.local);
  $temporada.textContent = `LaLiga · ${equipo.temporada}`;

  mostrar(html`
    <section class="ficha">
      <div class="cabecera">
        ${escudo(equipo.escudo, 56)}
        <div>
          <h1>${equipo.nombre}</h1>
          <p class="resumen">
            <strong>${equipo.posicion}º</strong> · ${equipo.puntos} pts · ${equipo.ganados}G ${equipo.empatados}E
            ${equipo.perdidos}P · ${equipo.golesAFavor} GF · ${equipo.golesEnContra} GC
          </p>
        </div>
        <ol class="racha" aria-label="Últimos resultados, del más reciente al más antiguo">
          ${equipo.ultimos.map(
            (partido) =>
              html`<li data-resultado="${partido.resultado}" title="${RESULTADOS[partido.resultado]}">${partido.resultado}</li>`,
          )}
        </ol>
      </div>

      ${proximo
        ? html`
            <h2>Próximo partido</h2>
            <div class="proximo">
              <ul class="partidos">${filaPartido(proximo)}</ul>
              <p class="detalle">${dia(proximo.fecha)} · ${proximo.estadio}</p>
              <button
                type="button"
                class="preguntar"
                data-preguntar="${equipo.nombre} - ${rival.nombre}: ¿cómo llegan los dos equipos al partido y quién crees que ganará?"
              >
                Pregúntale al asistente
              </button>
            </div>`
        : ''}

      <h2>Últimos partidos</h2>
      <ul class="partidos">${equipo.ultimos.map(filaPartido)}</ul>
    </section>`);
}

function pintarEstado(texto, error = false) {
  mostrar(html`<p class="estado ${error ? 'error' : ''}">${texto}</p>`);
}

/** Pinta lo que haya devuelto cualquiera de las tres herramientas */
function pintar(datos = {}) {
  const activa = datos.clasificacion ? 'ver_clasificacion' : datos.resultados ? 'ver_resultados' : null;
  for (const $pestaña of $pestañas) {
    $pestaña.toggleAttribute('aria-current', $pestaña.dataset.herramienta === activa);
  }

  if (datos.clasificacion) pintarClasificacion(datos.clasificacion);
  else if (datos.resultados) pintarResultados(datos.resultados);
  else if (datos.equipo) pintarEquipo(datos.equipo);
}

/* ───────────── Comunicación con el cliente MCP ───────────── */
// En directo: pasos 4 a 8 (los pasos 1 a 3 están en server.js). Descomenta cada bloque en orden
// (selecciona las líneas de código del paso y pulsa Cmd + /).

// ─── PASO 4 · El cliente nos pasa los argumentos y, después, el resultado ───────────
// toolinput llega en cuanto el modelo llama a la herramienta; toolresult, cuando termina.
// app.addEventListener('toolinput', ({ arguments: argumentos }) => {
//   if (argumentos?.equipo) pintarEstado(`Buscando «${argumentos.equipo}»…`);
// });
//
// app.addEventListener('toolresult', (resultado) => {
//   if (resultado.isError) pintarEstado(resultado.content?.[0]?.text ?? 'Algo ha fallado.', true);
//   else pintar(resultado.structuredContent);
// });

// ─── PASO 5 · La vista llama a las herramientas del servidor, sin pasar por el modelo ───
// Las pestañas y los clics en un equipo usan callServerTool.
// async function llamar(name, argumentos = {}) {
//   $contenido.setAttribute('aria-busy', 'true');
//   try {
//     const resultado = await app.callServerTool({ name, arguments: argumentos });
//     if (resultado.isError) throw new Error(resultado.content?.[0]?.text);
//     pintar(resultado.structuredContent);
//   } catch (error) {
//     pintarEstado(error.message || 'No se ha podido cargar.', true);
//   } finally {
//     $contenido.removeAttribute('aria-busy');
//   }
// }
//
// document.addEventListener('click', (evento) => {
//   const $pestaña = evento.target.closest('[data-herramienta]');
//   if ($pestaña) llamar($pestaña.dataset.herramienta);
//
//   const $equipo = evento.target.closest('[data-equipo]');
//   if ($equipo) llamar('ver_equipo', { equipo: $equipo.dataset.equipo });
// });

// ─── PASO 6 · Si el usuario abre un equipo en la vista, se lo contamos al modelo ─────
// document.addEventListener('click', (evento) => {
//   const $equipo = evento.target.closest('[data-equipo]');
//   if (!$equipo) return;
//
//   app.updateModelContext({
//     content: [{ type: 'text', text: `El usuario ha abierto en la interfaz la ficha de este equipo: ${$equipo.dataset.equipo}.` }],
//   });
// });

// ─── PASO 7 · La vista escribe en el chat en nombre del usuario ─────────────────────
// El botón «Pregúntale al asistente» de la ficha de un equipo.
// document.addEventListener('click', (evento) => {
//   const $preguntar = evento.target.closest('[data-preguntar]');
//   if (!$preguntar) return;
//
//   app.sendMessage({ role: 'user', content: [{ type: 'text', text: $preguntar.dataset.preguntar }] });
// });

// Conectamos con el cliente (siempre después de registrar los eventos)
await app.connect();

// ─── PASO 8 · Que la vista no desentone: el tema, los colores y las fuentes del cliente ───
// function aplicarContexto(contexto) {
//   if (contexto?.theme) applyDocumentTheme(contexto.theme);
//   if (contexto?.styles?.variables) applyHostStyleVariables(contexto.styles.variables);
//   if (contexto?.styles?.css?.fonts) applyHostFonts(contexto.styles.css.fonts);
// }
//
// aplicarContexto(app.getHostContext());
// app.addEventListener('hostcontextchanged', aplicarContexto);
