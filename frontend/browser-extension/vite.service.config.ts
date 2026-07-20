import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "src/service-worker.ts"),
      output: { entryFileNames: "service-worker.js", format: "es" },
    },
  },
});
