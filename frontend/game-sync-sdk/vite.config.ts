import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Preserve Vite 6's module target when upgrading to Vite 8.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    lib: {
      entry: "src/index.ts",
      name: "PlaySayGameSync",
      formats: ["es", "iife"],
      fileName: (format) => format === "es" ? "game-sync.js" : "game-sync.iife.js",
    },
    minify: "oxc",
    sourcemap: true,
  },
});
