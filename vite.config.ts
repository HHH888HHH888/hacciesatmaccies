import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the production build can be served from any subpath.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // dev: forward API calls to the live data service
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
