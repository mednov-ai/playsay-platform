import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Preserve Vite 6's module target when upgrading to Vite 8.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
  },
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_KEYBOARD_API_PROXY ?? "http://localhost:8084",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4175,
  },
});
