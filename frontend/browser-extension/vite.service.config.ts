import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rolldownOptions: {
      input: resolve(import.meta.dirname, "src/service-worker.ts"),
      output: { entryFileNames: "service-worker.js", format: "es" },
    },
  },
});
