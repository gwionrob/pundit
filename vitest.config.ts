import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (whose root is client/) so tests resolve from the repo root.
export default defineConfig({
  plugins: [react()],
  test: {
    root: ".",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
