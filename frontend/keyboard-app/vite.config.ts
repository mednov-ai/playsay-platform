import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
