import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "PlaySayGameSync",
      formats: ["es", "iife"],
      fileName: (format) => format === "es" ? "game-sync.js" : "game-sync.iife.js",
    },
    minify: "esbuild",
    sourcemap: true,
  },
});
