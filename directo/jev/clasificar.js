// En directo: la primera decisión con Jev. Abre /directo/clasificar en la web del taller y descomenta
// los pasos en orden (selecciona las líneas de código de cada paso y pulsa Cmd + /).
// La página se recarga sola al guardar y funciona después de cada paso.

// El token del taller (guardado en localStorage al introducirlo en la web) y el proxy del taller, que añade la clave de TypeSafe
const getToken = () => localStorage.getItem('taller:token') ?? '';
const API_JEV = '/api/jev';

// ─── PASO 1 · Una pregunta: ¿de qué trata el mensaje? ──────────────────────────────
// Jev no escribe texto: elige una de las opciones (choice) y da la probabilidad de cada una.
const preguntas = {
  tema: {
    type: 'choice',
    instructions: '¿De qué trata el mensaje del cliente?',
    criteria: {
      envio: 'Dónde está el pedido, retrasos o transporte',
      devolucion: 'Devolver o cambiar un producto',
      pago: 'Cobros, facturas o reembolsos',
      producto: 'Dudas sobre un producto',
      spam: 'Publicidad o nada que ver con la tienda',
    },
  },
};
//
export async function clasificar(mensaje) {
  const respuesta = await fetch(API_JEV, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: mensaje, questions: preguntas }),
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error?.message ?? `Jev ha respondido ${respuesta.status}`);
  return datos.answers;
}

// ─── PASO 2 · Más preguntas en la misma llamada ────────────────────────────────────
// Sí o no (noul: la probabilidad de «sí») y una escala (score: la media ponderada de los niveles).
preguntas.urgente = 
  { type: 'noul', instructions: '¿Hay que responderle hoy?' };

preguntas.enfado = {
  type: 'score',
  instructions: '¿Cómo de enfadado está el cliente?',
  criteria: ['Nada', 'Algo molesto', 'Muy enfadado'],
};

// ─── PASO 3 · El código decide con números, sin interpretar texto ──────────────────
export function decidir({ tema, urgente }) {
  if (tema.choice === 'spam' && tema.confidence > 0.8) return 'A la papelera';
  if (urgente?.noul > 0.7) return `Urgente · equipo de ${tema.choice}`;
  return `Equipo de ${tema.choice}`;
}
