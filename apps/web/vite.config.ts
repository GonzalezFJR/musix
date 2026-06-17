import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// Copiamos las fuentes musicales (Bravura) y el SoundFont de AlphaTab a /assets
// para que la app sea autoalojable sin depender de un CDN externo.
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        // El worker de render y el AudioWorklet se cargan en una URL RELATIVA al
        // bundle principal (/assets/), no a un scriptFile. Por eso los .mjs (que
        // importan ./alphaTab.core.mjs, autocontenido) van a la raíz de /assets.
        { src: "node_modules/@coderline/alphatab/dist/*.mjs", dest: "assets" },
        // Fuentes (Bravura) y SoundFont: rutas explícitas en ScoreViewer.
        { src: "node_modules/@coderline/alphatab/dist/font/*", dest: "assets/alphatab/font" },
        {
          src: "node_modules/@coderline/alphatab/dist/soundfont/*",
          dest: "assets/alphatab/soundfont",
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, redirige /api al backend de FastAPI.
      "/api": "http://localhost:8000",
    },
  },
  // AlphaTab usa Web Workers/AudioWorklets; evita pre-bundlearlo.
  optimizeDeps: { exclude: ["@coderline/alphatab"] },
});
