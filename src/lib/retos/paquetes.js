// Paquetes de npm que el código de los retos puede importar en el editor de /retos.
// scripts/vendor-retos.mjs los empaqueta como módulos ES en public/retos/vendor/<archivo>.js
// y el editor los añade al import map de la página que ejecuta tu código.
export const PAQUETES = {
  '@modelcontextprotocol/server': 'mcp-server',
  '@modelcontextprotocol/ext-apps': 'ext-apps',
  '@modelcontextprotocol/ext-apps/server': 'ext-apps-server',
  zod: 'zod',
  '@huggingface/transformers': 'transformers',
  'runonweb/translate': 'runonweb-translate',
  'runonweb/embed': 'runonweb-embed',
  'runonweb/stt': 'runonweb-stt',
};

export const CARPETA_VENDOR = '/retos/vendor';
