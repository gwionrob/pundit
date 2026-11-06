import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The React app lives in client/. In dev, Vite serves it on :5173 and proxies everything the
// Hono server owns (API, server-rendered landing + bulletin pages) to :3000.
const API = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": API,
      "/r/": API,
      "/healthz": API,
      "^/$": API,
    },
  },
});
