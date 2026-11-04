import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    rolldownOptions: {
      input: resolve(import.meta.dirname, "src/content-script.ts"),
      output: { entryFileNames: "content-script.js", format: "iife", codeSplitting: false },
    },
  },
});
