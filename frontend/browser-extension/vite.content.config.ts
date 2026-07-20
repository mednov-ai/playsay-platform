import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "src/content-script.ts"),
      output: { entryFileNames: "content-script.js", format: "iife", inlineDynamicImports: true },
    },
  },
});
