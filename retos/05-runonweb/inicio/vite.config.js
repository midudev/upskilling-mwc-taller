import { defineConfig } from 'vite';
import { verSolucion } from '../../ver-solucion.js'; // retos/ver-solucion.js

// La pestaña «Ver solución»: en /solucion/ se ejecuta la carpeta ../solucion con este mismo servidor
export default defineConfig({
  plugins: [verSolucion()],
  optimizeDeps: {
    // runonweb se publica en TypeScript: sin esto, Vite intenta leer sus .ts como JSX y el servidor se cae
    rolldownOptions: { moduleTypes: { '.ts': 'ts' } },
  },
});
