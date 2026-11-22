// La tienda ya funciona para personas (interfaz.js). Aquí se conecta con tus herramientas de webmcp.js.
// No hace falta tocar este archivo.
import { interfaz } from './interfaz.js';
import { registrarHerramientas } from './webmcp.js';

const herramientas = await registrarHerramientas(interfaz);

interfaz.aviso(herramientas.length ? `WebMCP: ${herramientas.length} herramientas` : 'WebMCP: sin herramientas');
if (herramientas.length) console.info('Herramientas registradas:', herramientas.join(', '));
