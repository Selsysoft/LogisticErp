/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8080" },
  },
  // Uçtan uca testler (e2e/) Playwright ile ayrıca çalışır.
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
