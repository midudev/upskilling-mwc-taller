// document.modelContext para el editor de los retos: la API de WebMCP en cualquier navegador.
// En Chrome con chrome://flags/#enable-webmcp-testing la pone el propio navegador; aquí la pone el editor
// para que la pestaña «Agente» vea y ejecute las herramientas que registra tu código.
(() => {
  const ID = '__RETO_ID__';
  const herramientas = new Map();
  const eventos = new EventTarget();

  const avisar = () => {
    eventos.dispatchEvent(new Event('toolchange'));
    try {
      parent.postMessage({ __reto: ID, tipo: 'herramientas' }, '*');
    } catch {}
  };

  const copia = (valor) => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));

  const modelContext = {
    async registerTool(herramienta) {
      const { name, description, inputSchema, execute } = herramienta ?? {};
      if (typeof name !== 'string' || !name) throw new TypeError('registerTool: la herramienta necesita un `name`.');
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name)) {
        throw new TypeError(`registerTool: "${name}" no es un nombre válido. Usa letras, números, «_» o «-», sin espacios.`);
      }
      if (typeof description !== 'string' || !description.trim()) {
        throw new TypeError(`registerTool: "${name}" necesita una \`description\`: es lo que lee el agente para decidir.`);
      }
      if (inputSchema !== undefined && (typeof inputSchema !== 'object' || inputSchema === null)) {
        throw new TypeError(`registerTool: el inputSchema de "${name}" tiene que ser un objeto (JSON Schema).`);
      }
      if (typeof execute !== 'function') throw new TypeError(`registerTool: "${name}" necesita una función \`execute\`.`);
      if (herramientas.has(name)) throw new Error(`registerTool: ya hay una herramienta llamada "${name}".`);

      herramientas.set(name, herramienta);
      avisar();
    },

    async unregisterTool(nombre) {
      herramientas.delete(typeof nombre === 'string' ? nombre : nombre?.name);
      avisar();
    },

    /** Lo que ve un agente: nombre, descripción, esquema y anotaciones (sin la función) */
    async getTools() {
      return [...herramientas.values()].map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        title,
        description,
        inputSchema: copia(inputSchema) ?? { type: 'object', properties: {} },
        annotations: copia(annotations) ?? {},
      }));
    },

    async executeTool(herramienta, argumentos = {}) {
      const nombre = typeof herramienta === 'string' ? herramienta : herramienta?.name;
      const registrada = herramientas.get(nombre);
      if (!registrada) throw new Error(`No hay ninguna herramienta llamada "${nombre}".`);

      for (const requerido of registrada.inputSchema?.required ?? []) {
        if (argumentos[requerido] === undefined) throw new Error(`Falta el parámetro obligatorio "${requerido}".`);
      }
      const cliente = { requestUserInteraction: async (fn) => fn() };
      return copia(await registrada.execute(argumentos, cliente));
    },

    addEventListener: eventos.addEventListener.bind(eventos),
    removeEventListener: eventos.removeEventListener.bind(eventos),
  };

  Object.defineProperty(document, 'modelContext', { value: modelContext, configurable: true });
})();
