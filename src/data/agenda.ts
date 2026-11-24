export interface AgendaStep {
  /** Minutos que dura esta parte */
  minutes: number;
  text: string;
}

export interface AgendaItem {
  /** Minutos totales del tramo */
  minutes: number;
  kind: 'intro' | 'bloque' | 'descanso' | 'cierre';
  /** Número de bloque (solo en los bloques) */
  block?: number;
  title: string;
  description: string;
  /** Desglose del tramo: explicación, código en directo, reto… */
  steps?: AgendaStep[];
  /** Slug del reto asociado */
  reto?: string;
}

/** Hora de inicio del taller (11:00) en minutos desde medianoche */
export const START = 11 * 60;

export const agenda: AgendaItem[] = [
  {
    minutes: 10,
    kind: 'intro',
    title: 'Bienvenida y puesta a punto',
    description: 'Qué vamos a construir y cómo funcionan los retos: se hacen en el navegador, en la web del taller, sin instalar nada.',
  },
  {
    minutes: 40,
    kind: 'bloque',
    block: 1,
    title: 'MCP UI',
    description:
      'Creamos un servidor MCP con los resultados de LaLiga, le añadimos una interfaz interactiva que se muestra dentro del chat y después hacemos lo mismo con la tienda.',
    steps: [
      { minutes: 5, text: 'Explicación: MCP en 5 minutos' },
      { minutes: 7, text: 'En directo: un servidor MCP con los resultados de LaLiga' },
      { minutes: 4, text: 'Explicación: MCP Apps, la herramienta trae su interfaz' },
      { minutes: 6, text: 'En directo: la clasificación de LaLiga con interfaz' },
      { minutes: 10, text: 'Reto 1, en el navegador: el catálogo de la tienda dentro del chat' },
      { minutes: 8, text: 'Repaso: la solución paso a paso y dudas' },
    ],
    reto: '01-mcp-ui',
  },
  {
    minutes: 35,
    kind: 'bloque',
    block: 2,
    title: 'WebMCP',
    description:
      'Hacemos que la tienda exponga sus funcionalidades como herramientas para los agentes del navegador.',
    steps: [
      { minutes: 10, text: 'Explicación: de leer la pantalla a llamar herramientas' },
      { minutes: 8, text: 'En directo: registrar la primera herramienta' },
      { minutes: 10, text: 'Reto 2, en el navegador: buscar, añadir al carrito y vaciarlo' },
      { minutes: 7, text: 'Repaso: la solución y un agente de verdad en Chrome' },
    ],
    reto: '02-webmcp',
  },
  {
    minutes: 10,
    kind: 'descanso',
    title: 'Descanso',
    description: 'Café, dudas y tiempo para ponerse al día.',
  },
  {
    minutes: 30,
    kind: 'bloque',
    block: 3,
    title: 'Jev',
    description:
      'Decisiones rápidas y estructuradas (elegir, puntuar, sí/no) que el código consume sin interpretar texto.',
    steps: [
      { minutes: 8, text: 'Explicación: choice, score y noul' },
      { minutes: 7, text: 'En directo: la primera decisión' },
      { minutes: 10, text: 'Reto 3, en el navegador: búsqueda inteligente y moderación de reseñas' },
      { minutes: 5, text: 'Repaso: la solución paso a paso y dudas' },
    ],
    reto: '03-jev',
  },
  {
    minutes: 35,
    kind: 'bloque',
    block: 4,
    title: 'IA en local en la web',
    description:
      'Ejecutamos modelos en el navegador con las APIs de IA integradas y WebGPU: privado, sin coste por petición y sin conexión.',
    steps: [
      { minutes: 10, text: 'Explicación: APIs integradas, WebGPU y limitaciones' },
      { minutes: 8, text: 'En directo: resumir en el navegador' },
      { minutes: 10, text: 'Reto 4, en el navegador: resumen de reseñas en local' },
      { minutes: 7, text: 'Repaso: Gemini Nano frente a Transformers.js' },
    ],
    reto: '04-ia-local',
  },
  {
    minutes: 10,
    kind: 'cierre',
    title: 'Las cuatro piezas juntas',
    description: 'Repasamos la aplicación completa y el criterio para decidir cuándo usar cada pieza.',
  },
  {
    minutes: 10,
    kind: 'cierre',
    title: 'Preguntas',
    description: 'Dudas finales, recursos para seguir y encuesta de valoración.',
  },
];

const format = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Agenda con la hora de inicio y fin de cada tramo ya calculada */
export const schedule = agenda.map((item, index) => {
  const offset = agenda.slice(0, index).reduce((sum, { minutes }) => sum + minutes, 0);
  return { ...item, start: format(START + offset), end: format(START + offset + item.minutes) };
});
