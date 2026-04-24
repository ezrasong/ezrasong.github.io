import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  publicDir: "assets",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "vendor";
        },
      },
    },
  },
  plugins: [react()],
});
