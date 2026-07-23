import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        // Landing chooser + the two thematic sites.
        main: entry('./index.html'),
        portfolio: entry('./portfolio.html'),
        seoul: entry('./seoul.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['cannon-es', 'gsap'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
