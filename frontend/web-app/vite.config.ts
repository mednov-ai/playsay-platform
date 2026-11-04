import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    // Preserve Vite 6's module target when upgrading to Vite 8.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    rolldownOptions: {
      input: {
        app: resolve(projectRoot, "index.html"),
        chatServiceWorker: resolve(projectRoot, "src/service-worker/chatServiceWorker.ts"),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "chatServiceWorker"
          ? "chat-service-worker.js"
          : "assets/[name]-[hash].js",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_PROXY ?? "http://localhost:8080",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
