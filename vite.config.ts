import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
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
