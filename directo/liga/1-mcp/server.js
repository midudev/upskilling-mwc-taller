import { createServer } from 'node:http';
import {
  NodeStreamableHTTPServerTransport,
  localhostHostValidation,
  localhostOriginValidation,
} from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { verClasificacion, verEquipo, verResultados } from './liga.js';
import { servirProbador } from '../../../probador/servir.js';

// En directo: descomenta los pasos en orden (selecciona las líneas de código de cada paso y pulsa Cmd + /).
// El servidor se reinicia solo al guardar y funciona después de cada paso.

// Fechas en hora de Madrid: "sáb, 22 nov, 14:00"
const fecha = (iso) =>
  new Date(iso).toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });

const marcador = ({ local, visitante }) => `${local.nombre} ${local.goles}-${visitante.goles} ${visitante.nombre}`;

function crearServidor() {
  const server = new McpServer({ name: 'laliga', version: '1.0.0' });

  // ─── PASO 1 · La primera herramienta: la clasificación ───────────────────────────
  // Nombre, descripción (el modelo decide con esto si la usa) y una función que devuelve texto.
  server.registerTool(
    'ver_clasificacion',
    {
      title: 'Clasificación de LaLiga',
      description: 'Devuelve la clasificación actual de LaLiga: posición, puntos, partidos y goles de cada equipo.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const clasificacion = await verClasificacion();
      const filas = clasificacion.equipos.map(
        (e) =>
          `${e.posicion}. ${e.nombre}: ${e.puntos} pts · ${e.jugados} PJ · ${e.ganados}G ${e.empatados}E ${e.perdidos}P · ` +
          `${e.golesAFavor} GF, ${e.golesEnContra} GC${e.zona ? ` · ${e.zona}` : ''}`,
      );
  
      return {
        content: [{ type: 'text', text: `Clasificación de LaLiga ${clasificacion.temporada}\n${filas.join('\n')}` }],
      };
    },
  );

  // ─── PASO 2 · Otra herramienta: los resultados de la última jornada ──────────────
  server.registerTool(
    'ver_resultados',
    {
      title: 'Resultados de la jornada',
      description: 'Devuelve los resultados de los partidos de la última jornada de LaLiga.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const resultados = await verResultados();
      const filas = resultados.partidos.map((p) => `- ${fecha(p.fecha)}: ${marcador(p)}${p.estado === 'in' ? ' (en juego)' : ''}`);
  
      return {
        content: [{ type: 'text', text: `Últimos resultados de LaLiga\n${filas.join('\n')}` }],
      };
    },
  );

  // ─── PASO 3 · Una herramienta con parámetros: la ficha de un equipo ──────────────
  // inputSchema (zod) le dice al modelo qué tiene que pasar. Si algo falla, isError: true.
  server.registerTool(
    'ver_equipo',
    {
      title: 'Ficha de un equipo',
      description: 'Posición en la tabla, últimos cinco resultados y próximo partido de un equipo de LaLiga.',
      inputSchema: z.object({
        equipo: z.string().describe('Nombre o apodo del equipo, por ejemplo "Barça", "Atleti" o "Real Sociedad"'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ equipo: texto }) => {
      try {
        const equipo = await verEquipo(texto);
        const { proximo } = equipo;
  
        const lineas = [
          `${equipo.nombre}: ${equipo.posicion}º en LaLiga ${equipo.temporada} con ${equipo.puntos} pts ` +
            `(${equipo.ganados}G ${equipo.empatados}E ${equipo.perdidos}P).`,
          'Últimos partidos (del más reciente al más antiguo):',
          ...equipo.ultimos.map((p) => `- ${p.resultado} · ${fecha(p.fecha)}: ${marcador(p)}`),
          proximo
            ? `Próximo partido: ${proximo.local.nombre} - ${proximo.visitante.nombre}, ${fecha(proximo.fecha)} en ${proximo.estadio}.`
            : 'No tiene partidos programados.',
        ];
  
        return {
          content: [{ type: 'text', text: lineas.join('\n') }]
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    },
  );

  return server;
}

if (process.argv.includes('--stdio')) {
  // Para clientes que arrancan el servidor como proceso (Claude Desktop, por ejemplo)
  await crearServidor().connect(new StdioServerTransport());
} else {
  // Servidor HTTP en http://localhost:3101/mcp
  const PUERTO = Number(process.env.PORT ?? 3101);
  const hostValido = localhostHostValidation();
  const origenValido = localhostOriginValidation();

  createServer(async (req, res) => {
    if (!hostValido(req, res) || !origenValido(req, res)) return;

    const { pathname } = new URL(req.url, 'http://localhost');

    // Fuera de /mcp, una web para probar el servidor desde el navegador
    if (pathname !== '/mcp') {
      await servirProbador(pathname, res);
      return;
    }

    // Sin sesiones: un servidor y un transporte por petición
    const transporte = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await crearServidor().connect(transporte);
    await transporte.handleRequest(req, res);
  }).listen(PUERTO, '127.0.0.1', () => {
    console.log(`Servidor MCP de LaLiga en http://localhost:${PUERTO}/mcp`);
    console.log(`Probador en http://localhost:${PUERTO}`);
  });
}
